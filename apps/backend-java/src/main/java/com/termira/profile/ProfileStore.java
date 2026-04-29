package com.termira.profile;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public final class ProfileStore {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
    };
    private static final Set<String> AUTH_TYPES = Set.of("password", "privateKey", "keyboardInteractive");
    private static final Set<String> FORWARD_TYPES = Set.of("local", "remote", "dynamic");

    private final Path dbPath;
    private final ObjectMapper mapper = new ObjectMapper();

    public ProfileStore(Path dbPath) {
        this.dbPath = dbPath;
        try {
            initialize();
        } catch (AppError error) {
            throw new IllegalStateException(error);
        }
    }

    public Path dbPath() {
        return dbPath;
    }

    public List<HostProfile> listProfiles() throws AppError {
        String sql = profileSelectSql() + " ORDER BY p.favorite DESC, p.last_connected_at DESC, p.name COLLATE NOCASE ASC";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet resultSet = statement.executeQuery()) {
            List<HostProfile> profiles = new ArrayList<>();
            while (resultSet.next()) {
                profiles.add(mapProfile(resultSet));
            }
            return profiles;
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    public List<HostProfile> searchProfiles(String query) throws AppError {
        String normalizedQuery = "%" + (query == null ? "" : query.trim().toLowerCase(Locale.ROOT)) + "%";
        String sql = profileSelectSql() + """
                WHERE lower(p.name) LIKE ?
                   OR lower(p.host) LIKE ?
                   OR lower(p.username) LIKE ?
                   OR lower(coalesce(g.name, '')) LIKE ?
                   OR lower(coalesce(p.tags_json, '')) LIKE ?
                   OR lower(coalesce(p.note, '')) LIKE ?
                ORDER BY p.favorite DESC, p.last_connected_at DESC, p.name COLLATE NOCASE ASC
                """;
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int index = 1; index <= 6; index++) {
                statement.setString(index, normalizedQuery);
            }
            try (ResultSet resultSet = statement.executeQuery()) {
                List<HostProfile> profiles = new ArrayList<>();
                while (resultSet.next()) {
                    profiles.add(mapProfile(resultSet));
                }
                return profiles;
            }
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    public HostProfile getProfile(String id) throws AppError {
        return findProfile(id).orElseThrow(() -> new AppError(
                ErrorCode.PROFILE_NOT_FOUND,
                "Host profile not found.",
                java.util.Map.of("id", id)
        ));
    }

    public Optional<HostProfile> findProfile(String id) throws AppError {
        requireText(id, "id");
        String sql = profileSelectSql() + " WHERE p.id = ?";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, id);
            try (ResultSet resultSet = statement.executeQuery()) {
                if (!resultSet.next()) {
                    return Optional.empty();
                }
                return Optional.of(mapProfile(resultSet));
            }
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    public HostProfile createProfile(HostProfileInput input) throws AppError {
        HostProfileInput normalized = normalizeCreateInput(input);
        String id = hasText(normalized.id()) ? normalized.id() : prefixedId("host");
        String now = Instant.now().toString();

        try (Connection connection = openConnection()) {
            String groupId = resolveGroupId(connection, normalized.groupId(), normalized.groupName());
            String sql = """
                    INSERT INTO host_profiles (
                      id, name, host, port, username, group_id, tags_json, note,
                      auth_type, credential_ref, private_key_path, save_credential,
                      default_remote_path, favorite, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """;
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                bindProfile(statement, id, normalized, groupId, now, now);
                statement.executeUpdate();
            }
        } catch (SQLException error) {
            throw storageError(error);
        }

        return getProfile(id);
    }

    public HostProfile updateProfile(String id, HostProfileInput input) throws AppError {
        requireText(id, "id");
        HostProfile current = getProfile(id);
        HostProfileInput normalized = normalizeUpdateInput(current, input);
        String now = Instant.now().toString();

        try (Connection connection = openConnection()) {
            String groupId = current.groupId();
            if (input != null && (input.groupId() != null || input.groupName() != null)) {
                groupId = resolveGroupId(connection, input.groupId(), input.groupName());
            }

            String sql = """
                    UPDATE host_profiles
                       SET name = ?,
                           host = ?,
                           port = ?,
                           username = ?,
                           group_id = ?,
                           tags_json = ?,
                           note = ?,
                           auth_type = ?,
                           credential_ref = ?,
                           private_key_path = ?,
                           save_credential = ?,
                           default_remote_path = ?,
                           favorite = ?,
                           updated_at = ?
                     WHERE id = ?
                    """;
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                AuthConfig auth = normalized.auth().normalized();
                statement.setString(1, normalized.name());
                statement.setString(2, normalized.host());
                statement.setInt(3, normalized.port());
                statement.setString(4, normalized.username());
                setNullableString(statement, 5, groupId);
                statement.setString(6, writeTags(normalized.tags()));
                setNullableString(statement, 7, blankToNull(normalized.note()));
                statement.setString(8, auth.type());
                setNullableString(statement, 9, auth.credentialRef());
                setNullableString(statement, 10, auth.privateKeyPath());
                statement.setInt(11, auth.saveCredential() ? 1 : 0);
                setNullableString(statement, 12, blankToNull(normalized.defaultRemotePath()));
                statement.setInt(13, Boolean.TRUE.equals(normalized.favorite()) ? 1 : 0);
                statement.setString(14, now);
                statement.setString(15, id);
                statement.executeUpdate();
            }
        } catch (SQLException error) {
            throw storageError(error);
        }

        return getProfile(id);
    }

    public boolean deleteProfile(String id) throws AppError {
        requireText(id, "id");
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement("DELETE FROM host_profiles WHERE id = ?")) {
            statement.setString(1, id);
            return statement.executeUpdate() > 0;
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    public HostProfile markFavorite(String id, boolean favorite) throws AppError {
        updateSingleProfileColumn(id, "favorite", favorite ? 1 : 0);
        return getProfile(id);
    }

    public HostProfile recordRecent(String id) throws AppError {
        requireText(id, "id");
        String now = Instant.now().toString();
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(
                     "UPDATE host_profiles SET last_connected_at = ?, updated_at = ? WHERE id = ?")) {
            statement.setString(1, now);
            statement.setString(2, now);
            statement.setString(3, id);
            if (statement.executeUpdate() == 0) {
                throw new AppError(ErrorCode.PROFILE_NOT_FOUND, "Host profile not found.", java.util.Map.of("id", id));
            }
        } catch (SQLException error) {
            throw storageError(error);
        }
        return getProfile(id);
    }

    public List<HostGroup> listGroups() throws AppError {
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(
                     "SELECT id, name, sort_order, created_at, updated_at FROM host_groups ORDER BY sort_order, name COLLATE NOCASE");
             ResultSet resultSet = statement.executeQuery()) {
            List<HostGroup> groups = new ArrayList<>();
            while (resultSet.next()) {
                groups.add(mapGroup(resultSet));
            }
            return groups;
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    public HostGroup createGroup(HostGroupInput input) throws AppError {
        requireText(input == null ? null : input.name(), "name");
        String id = hasText(input.id()) ? input.id() : prefixedId("group");
        String now = Instant.now().toString();
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement("""
                     INSERT INTO host_groups (id, name, sort_order, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?)
                     """)) {
            statement.setString(1, id);
            statement.setString(2, input.name().trim());
            statement.setInt(3, input.sortOrder() == null ? 0 : input.sortOrder());
            statement.setString(4, now);
            statement.setString(5, now);
            statement.executeUpdate();
        } catch (SQLException error) {
            throw storageError(error);
        }
        return getGroup(id);
    }

    public HostGroup updateGroup(String id, HostGroupInput input) throws AppError {
        requireText(id, "id");
        HostGroup current = getGroup(id);
        String name = hasText(input == null ? null : input.name()) ? input.name().trim() : current.name();
        int sortOrder = input == null || input.sortOrder() == null ? current.sortOrder() : input.sortOrder();
        String now = Instant.now().toString();
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(
                     "UPDATE host_groups SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?")) {
            statement.setString(1, name);
            statement.setInt(2, sortOrder);
            statement.setString(3, now);
            statement.setString(4, id);
            statement.executeUpdate();
        } catch (SQLException error) {
            throw storageError(error);
        }
        return getGroup(id);
    }

    public boolean deleteGroup(String id) throws AppError {
        requireText(id, "id");
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement("DELETE FROM host_groups WHERE id = ?")) {
            statement.setString(1, id);
            return statement.executeUpdate() > 0;
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    public List<ForwardRule> listForwardRules(String profileId) throws AppError {
        String sql = """
                SELECT id, profile_id, name, type, bind_host, bind_port, target_host, target_port, created_at, updated_at
                  FROM forward_rules
                """;
        if (hasText(profileId)) {
            sql += " WHERE profile_id = ?";
        }
        sql += " ORDER BY name COLLATE NOCASE";

        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            if (hasText(profileId)) {
                statement.setString(1, profileId);
            }
            try (ResultSet resultSet = statement.executeQuery()) {
                List<ForwardRule> rules = new ArrayList<>();
                while (resultSet.next()) {
                    rules.add(mapForwardRule(resultSet));
                }
                return rules;
            }
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    public ForwardRule saveForwardRule(ForwardRuleInput input) throws AppError {
        validateForwardRule(input);
        String id = hasText(input.id()) ? input.id() : prefixedId("forward");
        String now = Instant.now().toString();

        try (Connection connection = openConnection()) {
            ensureProfileExists(connection, input.profileId());
            boolean exists = rowExists(connection, "forward_rules", id);
            String sql = exists
                    ? """
                    UPDATE forward_rules
                       SET profile_id = ?, name = ?, type = ?, bind_host = ?, bind_port = ?,
                           target_host = ?, target_port = ?, updated_at = ?
                     WHERE id = ?
                    """
                    : """
                    INSERT INTO forward_rules (
                      profile_id, name, type, bind_host, bind_port, target_host, target_port,
                      updated_at, id, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """;
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, input.profileId());
                statement.setString(2, input.name().trim());
                statement.setString(3, input.type());
                statement.setString(4, input.bindHost().trim());
                statement.setInt(5, input.bindPort());
                setNullableString(statement, 6, blankToNull(input.targetHost()));
                setNullableInteger(statement, 7, input.targetPort());
                statement.setString(8, now);
                statement.setString(9, id);
                if (!exists) {
                    statement.setString(10, now);
                }
                statement.executeUpdate();
            }
        } catch (SQLException error) {
            throw storageError(error);
        }

        return getForwardRule(id);
    }

    public boolean deleteForwardRule(String id) throws AppError {
        requireText(id, "id");
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement("DELETE FROM forward_rules WHERE id = ?")) {
            statement.setString(1, id);
            return statement.executeUpdate() > 0;
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    public List<QuickCommand> listQuickCommands(String profileId) throws AppError {
        String sql = """
                SELECT id, profile_id, group_name, name, command, note, created_at, updated_at
                  FROM quick_commands
                """;
        if (hasText(profileId)) {
            sql += " WHERE profile_id = ? OR profile_id IS NULL";
        }
        sql += " ORDER BY group_name COLLATE NOCASE, name COLLATE NOCASE";

        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            if (hasText(profileId)) {
                statement.setString(1, profileId);
            }
            try (ResultSet resultSet = statement.executeQuery()) {
                List<QuickCommand> commands = new ArrayList<>();
                while (resultSet.next()) {
                    commands.add(mapQuickCommand(resultSet));
                }
                return commands;
            }
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    public QuickCommand saveQuickCommand(QuickCommandInput input) throws AppError {
        validateQuickCommand(input);
        String id = hasText(input.id()) ? input.id() : prefixedId("command");
        String now = Instant.now().toString();

        try (Connection connection = openConnection()) {
            if (hasText(input.profileId())) {
                ensureProfileExists(connection, input.profileId());
            }
            boolean exists = rowExists(connection, "quick_commands", id);
            String sql = exists
                    ? """
                    UPDATE quick_commands
                       SET profile_id = ?, group_name = ?, name = ?, command = ?, note = ?, updated_at = ?
                     WHERE id = ?
                    """
                    : """
                    INSERT INTO quick_commands (
                      profile_id, group_name, name, command, note, updated_at, id, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """;
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                setNullableString(statement, 1, blankToNull(input.profileId()));
                setNullableString(statement, 2, blankToNull(input.groupName()));
                statement.setString(3, input.name().trim());
                statement.setString(4, input.command());
                setNullableString(statement, 5, blankToNull(input.note()));
                statement.setString(6, now);
                statement.setString(7, id);
                if (!exists) {
                    statement.setString(8, now);
                }
                statement.executeUpdate();
            }
        } catch (SQLException error) {
            throw storageError(error);
        }

        return getQuickCommand(id);
    }

    public boolean deleteQuickCommand(String id) throws AppError {
        requireText(id, "id");
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement("DELETE FROM quick_commands WHERE id = ?")) {
            statement.setString(1, id);
            return statement.executeUpdate() > 0;
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    private void initialize() throws AppError {
        try {
            Path parent = dbPath.toAbsolutePath().getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
        } catch (IOException error) {
            throw storageError(error);
        }

        try (Connection connection = openConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("PRAGMA journal_mode = WAL");
            statement.execute("""
                    CREATE TABLE IF NOT EXISTS host_groups (
                      id TEXT PRIMARY KEY,
                      name TEXT NOT NULL UNIQUE,
                      sort_order INTEGER NOT NULL DEFAULT 0,
                      created_at TEXT NOT NULL,
                      updated_at TEXT NOT NULL
                    )
                    """);
            statement.execute("""
                    CREATE TABLE IF NOT EXISTS host_profiles (
                      id TEXT PRIMARY KEY,
                      name TEXT NOT NULL,
                      host TEXT NOT NULL,
                      port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
                      username TEXT NOT NULL,
                      group_id TEXT REFERENCES host_groups(id) ON DELETE SET NULL,
                      tags_json TEXT NOT NULL DEFAULT '[]',
                      note TEXT,
                      auth_type TEXT NOT NULL,
                      credential_ref TEXT,
                      private_key_path TEXT,
                      save_credential INTEGER NOT NULL DEFAULT 0,
                      default_remote_path TEXT,
                      favorite INTEGER NOT NULL DEFAULT 0,
                      created_at TEXT NOT NULL,
                      updated_at TEXT NOT NULL,
                      last_connected_at TEXT
                    )
                    """);
            statement.execute("""
                    CREATE TABLE IF NOT EXISTS forward_rules (
                      id TEXT PRIMARY KEY,
                      profile_id TEXT NOT NULL REFERENCES host_profiles(id) ON DELETE CASCADE,
                      name TEXT NOT NULL,
                      type TEXT NOT NULL,
                      bind_host TEXT NOT NULL,
                      bind_port INTEGER NOT NULL CHECK (bind_port BETWEEN 1 AND 65535),
                      target_host TEXT,
                      target_port INTEGER CHECK (target_port BETWEEN 1 AND 65535),
                      created_at TEXT NOT NULL,
                      updated_at TEXT NOT NULL
                    )
                    """);
            statement.execute("""
                    CREATE TABLE IF NOT EXISTS quick_commands (
                      id TEXT PRIMARY KEY,
                      profile_id TEXT REFERENCES host_profiles(id) ON DELETE CASCADE,
                      group_name TEXT,
                      name TEXT NOT NULL,
                      command TEXT NOT NULL,
                      note TEXT,
                      created_at TEXT NOT NULL,
                      updated_at TEXT NOT NULL
                    )
                    """);
            statement.execute("PRAGMA user_version = 1");
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    private Connection openConnection() throws SQLException {
        Connection connection = DriverManager.getConnection("jdbc:sqlite:" + dbPath.toAbsolutePath());
        try (Statement statement = connection.createStatement()) {
            statement.execute("PRAGMA foreign_keys = ON");
            statement.execute("PRAGMA busy_timeout = 5000");
        }
        return connection;
    }

    private String profileSelectSql() {
        return """
                SELECT p.id, p.name, p.host, p.port, p.username, p.group_id, g.name AS group_name,
                       p.tags_json, p.note, p.auth_type, p.credential_ref, p.private_key_path,
                       p.save_credential, p.default_remote_path, p.favorite, p.created_at,
                       p.updated_at, p.last_connected_at
                  FROM host_profiles p
                  LEFT JOIN host_groups g ON g.id = p.group_id
                """;
    }

    private HostProfile mapProfile(ResultSet resultSet) throws SQLException, AppError {
        AuthConfig auth = new AuthConfig(
                resultSet.getString("auth_type"),
                resultSet.getString("credential_ref"),
                resultSet.getString("private_key_path"),
                resultSet.getInt("save_credential") == 1
        ).normalized();
        return new HostProfile(
                resultSet.getString("id"),
                resultSet.getString("name"),
                resultSet.getString("host"),
                resultSet.getInt("port"),
                resultSet.getString("username"),
                resultSet.getString("group_id"),
                resultSet.getString("group_name"),
                readTags(resultSet.getString("tags_json")),
                resultSet.getString("note"),
                auth,
                resultSet.getString("default_remote_path"),
                resultSet.getInt("favorite") == 1,
                resultSet.getString("created_at"),
                resultSet.getString("updated_at"),
                resultSet.getString("last_connected_at")
        );
    }

    private HostGroup mapGroup(ResultSet resultSet) throws SQLException {
        return new HostGroup(
                resultSet.getString("id"),
                resultSet.getString("name"),
                resultSet.getInt("sort_order"),
                resultSet.getString("created_at"),
                resultSet.getString("updated_at")
        );
    }

    private ForwardRule mapForwardRule(ResultSet resultSet) throws SQLException {
        return new ForwardRule(
                resultSet.getString("id"),
                resultSet.getString("profile_id"),
                resultSet.getString("name"),
                resultSet.getString("type"),
                resultSet.getString("bind_host"),
                resultSet.getInt("bind_port"),
                resultSet.getString("target_host"),
                nullableInteger(resultSet, "target_port"),
                resultSet.getString("created_at"),
                resultSet.getString("updated_at")
        );
    }

    private QuickCommand mapQuickCommand(ResultSet resultSet) throws SQLException {
        return new QuickCommand(
                resultSet.getString("id"),
                resultSet.getString("profile_id"),
                resultSet.getString("group_name"),
                resultSet.getString("name"),
                resultSet.getString("command"),
                resultSet.getString("note"),
                resultSet.getString("created_at"),
                resultSet.getString("updated_at")
        );
    }

    private HostGroup getGroup(String id) throws AppError {
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(
                     "SELECT id, name, sort_order, created_at, updated_at FROM host_groups WHERE id = ?")) {
            statement.setString(1, id);
            try (ResultSet resultSet = statement.executeQuery()) {
                if (!resultSet.next()) {
                    throw new AppError(ErrorCode.PROFILE_NOT_FOUND, "Host group not found.", java.util.Map.of("id", id));
                }
                return mapGroup(resultSet);
            }
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    private ForwardRule getForwardRule(String id) throws AppError {
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT id, profile_id, name, type, bind_host, bind_port, target_host, target_port, created_at, updated_at
                       FROM forward_rules
                      WHERE id = ?
                     """)) {
            statement.setString(1, id);
            try (ResultSet resultSet = statement.executeQuery()) {
                if (!resultSet.next()) {
                    throw new AppError(ErrorCode.PROFILE_NOT_FOUND, "Forward rule not found.", java.util.Map.of("id", id));
                }
                return mapForwardRule(resultSet);
            }
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    private QuickCommand getQuickCommand(String id) throws AppError {
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT id, profile_id, group_name, name, command, note, created_at, updated_at
                       FROM quick_commands
                      WHERE id = ?
                     """)) {
            statement.setString(1, id);
            try (ResultSet resultSet = statement.executeQuery()) {
                if (!resultSet.next()) {
                    throw new AppError(ErrorCode.PROFILE_NOT_FOUND, "Quick command not found.", java.util.Map.of("id", id));
                }
                return mapQuickCommand(resultSet);
            }
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    private HostProfileInput normalizeCreateInput(HostProfileInput input) throws AppError {
        if (input == null) {
            throw validationError("Host profile input is required.");
        }
        requireText(input.name(), "name");
        requireText(input.host(), "host");
        requireText(input.username(), "username");
        int port = validatePort(input.port() == null ? 22 : input.port(), "port");
        AuthConfig auth = normalizeAuth(input.auth());
        return new HostProfileInput(
                blankToNull(input.id()),
                input.name().trim(),
                input.host().trim(),
                port,
                input.username().trim(),
                blankToNull(input.groupId()),
                blankToNull(input.groupName()),
                normalizeTags(input.tags()),
                blankToNull(input.note()),
                auth,
                blankToNull(input.defaultRemotePath()),
                Boolean.TRUE.equals(input.favorite())
        );
    }

    private HostProfileInput normalizeUpdateInput(HostProfile current, HostProfileInput input) throws AppError {
        if (input == null) {
            input = new HostProfileInput(null, null, null, null, null, null, null, null, null, null, null, null);
        }
        String name = hasText(input.name()) ? input.name().trim() : current.name();
        String host = hasText(input.host()) ? input.host().trim() : current.host();
        String username = hasText(input.username()) ? input.username().trim() : current.username();
        int port = validatePort(input.port() == null ? current.port() : input.port(), "port");
        AuthConfig auth = input.auth() == null ? current.auth() : normalizeAuth(input.auth());
        List<String> tags = input.tags() == null ? current.tags() : normalizeTags(input.tags());
        String note = input.note() == null ? current.note() : blankToNull(input.note());
        String defaultRemotePath = input.defaultRemotePath() == null ? current.defaultRemotePath() : blankToNull(input.defaultRemotePath());
        boolean favorite = input.favorite() == null ? current.favorite() : input.favorite();
        return new HostProfileInput(
                current.id(),
                name,
                host,
                port,
                username,
                input.groupId(),
                input.groupName(),
                tags,
                note,
                auth,
                defaultRemotePath,
                favorite
        );
    }

    private AuthConfig normalizeAuth(AuthConfig auth) throws AppError {
        AuthConfig normalized = (auth == null ? new AuthConfig("password", null, null, false) : auth).normalized();
        if (!AUTH_TYPES.contains(normalized.type())) {
            throw validationError("Unsupported auth type.");
        }
        return normalized;
    }

    private void bindProfile(
            PreparedStatement statement,
            String id,
            HostProfileInput input,
            String groupId,
            String createdAt,
            String updatedAt
    ) throws SQLException, AppError {
        AuthConfig auth = input.auth().normalized();
        statement.setString(1, id);
        statement.setString(2, input.name());
        statement.setString(3, input.host());
        statement.setInt(4, input.port());
        statement.setString(5, input.username());
        setNullableString(statement, 6, groupId);
        statement.setString(7, writeTags(input.tags()));
        setNullableString(statement, 8, input.note());
        statement.setString(9, auth.type());
        setNullableString(statement, 10, auth.credentialRef());
        setNullableString(statement, 11, auth.privateKeyPath());
        statement.setInt(12, auth.saveCredential() ? 1 : 0);
        setNullableString(statement, 13, input.defaultRemotePath());
        statement.setInt(14, Boolean.TRUE.equals(input.favorite()) ? 1 : 0);
        statement.setString(15, createdAt);
        statement.setString(16, updatedAt);
    }

    private String resolveGroupId(Connection connection, String groupId, String groupName) throws SQLException {
        if (hasText(groupId)) {
            return groupId.trim();
        }
        if (!hasText(groupName)) {
            return null;
        }

        String normalizedName = groupName.trim();
        try (PreparedStatement query = connection.prepareStatement(
                "SELECT id FROM host_groups WHERE name = ? COLLATE NOCASE")) {
            query.setString(1, normalizedName);
            try (ResultSet resultSet = query.executeQuery()) {
                if (resultSet.next()) {
                    return resultSet.getString("id");
                }
            }
        }

        String id = prefixedId("group");
        String now = Instant.now().toString();
        try (PreparedStatement insert = connection.prepareStatement("""
                INSERT INTO host_groups (id, name, sort_order, created_at, updated_at)
                VALUES (?, ?, 0, ?, ?)
                """)) {
            insert.setString(1, id);
            insert.setString(2, normalizedName);
            insert.setString(3, now);
            insert.setString(4, now);
            insert.executeUpdate();
        }
        return id;
    }

    private void ensureProfileExists(Connection connection, String profileId) throws AppError, SQLException {
        requireText(profileId, "profileId");
        if (!rowExists(connection, "host_profiles", profileId)) {
            throw new AppError(ErrorCode.PROFILE_NOT_FOUND, "Host profile not found.", java.util.Map.of("id", profileId));
        }
    }

    private boolean rowExists(Connection connection, String table, String id) throws SQLException {
        String sql = "SELECT 1 FROM " + table + " WHERE id = ?";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, id);
            try (ResultSet resultSet = statement.executeQuery()) {
                return resultSet.next();
            }
        }
    }

    private void updateSingleProfileColumn(String id, String column, int value) throws AppError {
        requireText(id, "id");
        String now = Instant.now().toString();
        String sql = "UPDATE host_profiles SET " + column + " = ?, updated_at = ? WHERE id = ?";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, value);
            statement.setString(2, now);
            statement.setString(3, id);
            if (statement.executeUpdate() == 0) {
                throw new AppError(ErrorCode.PROFILE_NOT_FOUND, "Host profile not found.", java.util.Map.of("id", id));
            }
        } catch (SQLException error) {
            throw storageError(error);
        }
    }

    private void validateForwardRule(ForwardRuleInput input) throws AppError {
        if (input == null) {
            throw validationError("Forward rule input is required.");
        }
        requireText(input.profileId(), "profileId");
        requireText(input.name(), "name");
        requireText(input.type(), "type");
        requireText(input.bindHost(), "bindHost");
        validatePort(input.bindPort(), "bindPort");
        if (!FORWARD_TYPES.contains(input.type())) {
            throw validationError("Unsupported forward rule type.");
        }
        if (!"dynamic".equals(input.type())) {
            requireText(input.targetHost(), "targetHost");
            validatePort(input.targetPort(), "targetPort");
        }
    }

    private void validateQuickCommand(QuickCommandInput input) throws AppError {
        if (input == null) {
            throw validationError("Quick command input is required.");
        }
        requireText(input.name(), "name");
        requireText(input.command(), "command");
    }

    private List<String> normalizeTags(List<String> tags) {
        if (tags == null) {
            return List.of();
        }
        return tags.stream()
                .filter(ProfileStore::hasText)
                .map(String::trim)
                .distinct()
                .toList();
    }

    private List<String> readTags(String tagsJson) throws AppError {
        if (!hasText(tagsJson)) {
            return List.of();
        }
        try {
            return normalizeTags(mapper.readValue(tagsJson, STRING_LIST));
        } catch (JsonProcessingException error) {
            throw storageError(error);
        }
    }

    private String writeTags(List<String> tags) throws AppError {
        try {
            return mapper.writeValueAsString(normalizeTags(tags));
        } catch (JsonProcessingException error) {
            throw storageError(error);
        }
    }

    private int validatePort(Integer port, String field) throws AppError {
        if (port == null || port < 1 || port > 65535) {
            throw validationError(field + " must be between 1 and 65535.");
        }
        return port;
    }

    private void requireText(String value, String field) throws AppError {
        if (!hasText(value)) {
            throw validationError(field + " is required.");
        }
    }

    private AppError validationError(String message) {
        return new AppError(ErrorCode.PROFILE_VALIDATION_FAILED, message);
    }

    private AppError storageError(Exception error) {
        return new AppError(ErrorCode.PROFILE_STORAGE_ERROR, "Profile store operation failed.",
                java.util.Map.of("cause", error.getClass().getSimpleName()));
    }

    private static void setNullableString(PreparedStatement statement, int index, String value) throws SQLException {
        if (hasText(value)) {
            statement.setString(index, value);
        } else {
            statement.setNull(index, Types.VARCHAR);
        }
    }

    private static void setNullableInteger(PreparedStatement statement, int index, Integer value) throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.INTEGER);
        } else {
            statement.setInt(index, value);
        }
    }

    private static Integer nullableInteger(ResultSet resultSet, String column) throws SQLException {
        int value = resultSet.getInt(column);
        return resultSet.wasNull() ? null : value;
    }

    private static String blankToNull(String value) {
        return hasText(value) ? value.trim() : null;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String prefixedId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "");
    }
}
