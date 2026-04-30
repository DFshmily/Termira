package com.termira.ssh;

import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import com.termira.ipc.IpcEvent;
import com.termira.ipc.IpcEventSink;
import com.termira.profile.AuthConfig;
import com.termira.profile.HostProfile;
import com.termira.profile.ProfileStore;
import com.termira.vault.CredentialRecord;
import com.termira.vault.VaultManager;
import java.io.StringReader;
import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.common.DisconnectReason;
import net.schmizz.sshj.common.SSHException;
import net.schmizz.sshj.connection.channel.direct.Session;
import net.schmizz.sshj.sftp.SFTPClient;
import net.schmizz.sshj.transport.TransportException;
import net.schmizz.sshj.transport.verification.PromiscuousVerifier;
import net.schmizz.sshj.userauth.UserAuthException;
import net.schmizz.sshj.userauth.method.AuthKeyboardInteractive;
import net.schmizz.sshj.userauth.method.PasswordResponseProvider;
import net.schmizz.sshj.userauth.keyprovider.KeyProvider;
import net.schmizz.sshj.userauth.keyprovider.OpenSSHKeyFile;
import net.schmizz.sshj.userauth.password.PasswordFinder;
import net.schmizz.sshj.userauth.password.PasswordUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class SshSessionManager implements AutoCloseable {
    private static final Logger LOGGER = LoggerFactory.getLogger(SshSessionManager.class);
    private static final int DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
    private static final int DEFAULT_COLS = 100;
    private static final int DEFAULT_ROWS = 30;

    private final ProfileStore profileStore;
    private final VaultManager vaultManager;
    private final Map<String, SshSessionHandle> sessions = new ConcurrentHashMap<>();
    private final ExecutorService terminalExecutor = Executors.newCachedThreadPool(daemonThreadFactory());
    private volatile IpcEventSink eventSink;

    public SshSessionManager(ProfileStore profileStore, VaultManager vaultManager, IpcEventSink eventSink) {
        this.profileStore = profileStore;
        this.vaultManager = vaultManager;
        this.eventSink = eventSink == null ? IpcEventSink.NOOP : eventSink;
    }

    public void setEventSink(IpcEventSink eventSink) {
        this.eventSink = eventSink == null ? IpcEventSink.NOOP : eventSink;
    }

    public SshSessionView connect(SshConnectRequest request) throws AppError {
        SshConnectionSpec spec = resolveConnectionSpec(request);
        SSHClient client = new SSHClient();
        client.addHostKeyVerifier(new PromiscuousVerifier());
        client.setConnectTimeout(spec.connectTimeoutMs());
        client.setTimeout(spec.connectTimeoutMs());

        SshSessionHandle handle = new SshSessionHandle(spec, client, SshStatus.CREATED);
        sessions.put(spec.sessionId(), handle);
        emitStatus(handle, SshStatus.CONNECTING);

        try {
            client.connect(spec.host(), spec.port());
            emitStatus(handle, SshStatus.AUTHENTICATING);
            authenticate(client, spec);
            handle.clearError();
            emitStatus(handle, SshStatus.CONNECTED);
            if (spec.profileId() != null) {
                profileStore.recordRecent(spec.profileId());
            }
            LOGGER.info("ssh.connect sessionId={} profileId={} host={} port={} status=connected",
                    spec.sessionId(), spec.profileId(), maskHost(spec.host()), spec.port());
            return handle.view();
        } catch (AppError error) {
            markFailed(handle, error.code(), error.getMessage());
            disconnectQuietly(handle);
            sessions.remove(spec.sessionId());
            throw error;
        } catch (Exception error) {
            AppError mapped = mapConnectError(error);
            LOGGER.warn("ssh.connect sessionId={} profileId={} failure cause={} message={}",
                    spec.sessionId(), spec.profileId(), error.getClass().getSimpleName(), error.getMessage());
            markFailed(handle, mapped.code(), mapped.getMessage());
            disconnectQuietly(handle);
            sessions.remove(spec.sessionId());
            throw mapped;
        }
    }

    public Map<String, Object> disconnect(SshDisconnectRequest request) throws AppError {
        String sessionId = requireText(request == null ? null : request.sessionId(), "sessionId");
        SshSessionHandle handle = requireSession(sessionId);
        emitStatus(handle, SshStatus.DISCONNECTING);
        disconnectQuietly(handle);
        sessions.remove(sessionId);
        emitStatus(handle, SshStatus.DISCONNECTED);
        return Map.of("sessionId", sessionId, "disconnected", true);
    }

    public SshSessionView getSession(String sessionId) throws AppError {
        return requireSession(sessionId).view();
    }

    public SFTPClient openSftpClient(String sessionId) throws AppError {
        SshSessionHandle handle = requireSession(sessionId);
        if (handle.status() != SshStatus.CONNECTED || !handle.client().isConnected()) {
            throw new AppError(ErrorCode.SFTP_NOT_CONNECTED, "SSH session is not connected.", Map.of("sessionId", sessionId));
        }
        try {
            return handle.client().newSFTPClient();
        } catch (IOException error) {
            throw new AppError(
                    ErrorCode.SFTP_NOT_CONNECTED,
                    "Failed to open SFTP client.",
                    Map.of("sessionId", sessionId, "cause", error.getClass().getSimpleName())
            );
        }
    }

    public SSHClient requireConnectedClient(String sessionId) throws AppError {
        return requireConnectedClient(sessionId, ErrorCode.FORWARD_NOT_CONNECTED, "SSH session is not connected.");
    }

    public SSHClient requireConnectedClient(String sessionId, String errorCode, String message) throws AppError {
        SshSessionHandle handle = requireSession(sessionId);
        if (handle.status() != SshStatus.CONNECTED || !handle.client().isConnected() || !handle.client().isAuthenticated()) {
            throw new AppError(errorCode, message, Map.of("sessionId", sessionId));
        }
        return handle.client();
    }

    public RemoteCommandResult exec(
            String sessionId,
            String command,
            int timeoutMs,
            String disconnectedErrorCode,
            String operationErrorCode
    ) throws AppError {
        String id = requireText(sessionId, "sessionId");
        String remoteCommand = requireText(command, "command");
        int timeout = Math.max(500, timeoutMs);
        SSHClient client = requireConnectedClient(id, disconnectedErrorCode, "SSH session is not connected.");
        String startedAt = Instant.now().toString();

        try (Session sshSession = client.startSession()) {
            Session.Command exec = sshSession.exec(remoteCommand);
            Future<String> stdout = terminalExecutor.submit(() -> readAll(exec.getInputStream()));
            Future<String> stderr = terminalExecutor.submit(() -> readAll(exec.getErrorStream()));
            try {
                exec.join(timeout, TimeUnit.MILLISECONDS);
                Integer exitStatus = exec.getExitStatus();
                if (exitStatus == null) {
                    closeCommandQuietly(exec);
                    throw new AppError(
                            operationErrorCode,
                            "Remote command timed out.",
                            Map.of("sessionId", id, "timeoutMs", timeout)
                    );
                }
                return new RemoteCommandResult(
                        id,
                        exitStatus,
                        readFuture(stdout, operationErrorCode),
                        readFuture(stderr, operationErrorCode),
                        startedAt,
                        Instant.now().toString()
                );
            } finally {
                closeCommandQuietly(exec);
            }
        } catch (AppError error) {
            throw error;
        } catch (Exception error) {
            throw new AppError(
                    operationErrorCode,
                    "Failed to execute remote command.",
                    Map.of("sessionId", id, "cause", error.getClass().getSimpleName())
            );
        }
    }

    public Map<String, Object> openShell(TerminalOpenShellRequest request) throws AppError {
        String sessionId = requireText(request == null ? null : request.sessionId(), "sessionId");
        SshSessionHandle handle = requireSession(sessionId);
        if (handle.status() != SshStatus.CONNECTED) {
            throw new AppError(ErrorCode.SSH_SESSION_NOT_FOUND, "SSH session is not connected.", Map.of("sessionId", sessionId));
        }

        String channelId = hasText(request.channelId()) ? request.channelId().trim() : prefixedId("chan");
        int cols = normalizeDimension(request.cols(), DEFAULT_COLS);
        int rows = normalizeDimension(request.rows(), DEFAULT_ROWS);
        String term = hasText(request.term()) ? request.term().trim() : "xterm-256color";

        try {
            net.schmizz.sshj.connection.channel.direct.Session sshSession = handle.client().startSession();
            sshSession.allocatePTY(term, cols, rows, 0, 0, Map.of());
            net.schmizz.sshj.connection.channel.direct.Session.Shell shell = sshSession.startShell();
            TerminalChannel channel = new TerminalChannel(sessionId, channelId, sshSession, shell, eventSink, terminalExecutor);
            handle.putChannel(channel);
            return Map.of(
                    "sessionId", sessionId,
                    "channelId", channelId,
                    "cols", cols,
                    "rows", rows
            );
        } catch (Exception error) {
            throw new AppError(
                    ErrorCode.SSH_CHANNEL_OPEN_FAILED,
                    "Failed to open terminal shell.",
                    Map.of("sessionId", sessionId, "cause", error.getClass().getSimpleName())
            );
        }
    }

    public Map<String, Object> write(TerminalWriteRequest request) throws AppError {
        TerminalChannel channel = requireChannel(request == null ? null : request.sessionId(), request == null ? null : request.channelId());
        channel.write(request.data() == null ? "" : request.data());
        return Map.of("written", true);
    }

    public Map<String, Object> resize(TerminalResizeRequest request) throws AppError {
        TerminalChannel channel = requireChannel(request == null ? null : request.sessionId(), request == null ? null : request.channelId());
        int cols = normalizeDimension(request.cols(), DEFAULT_COLS);
        int rows = normalizeDimension(request.rows(), DEFAULT_ROWS);
        int width = normalizePixelDimension(request.width());
        int height = normalizePixelDimension(request.height());
        channel.resize(cols, rows, width, height);
        return Map.of("resized", true, "cols", cols, "rows", rows);
    }

    public Map<String, Object> closeTerminal(TerminalCloseRequest request) throws AppError {
        String sessionId = requireText(request == null ? null : request.sessionId(), "sessionId");
        String channelId = requireText(request.channelId(), "channelId");
        SshSessionHandle handle = requireSession(sessionId);
        TerminalChannel channel = handle.removeChannel(channelId);
        if (channel == null) {
            throw new AppError(ErrorCode.SSH_TERMINAL_NOT_FOUND, "Terminal channel not found.", Map.of("channelId", channelId));
        }
        channel.close();
        return Map.of("sessionId", sessionId, "channelId", channelId, "closed", true);
    }

    @Override
    public void close() {
        List<String> ids = new ArrayList<>(sessions.keySet());
        for (String sessionId : ids) {
            SshSessionHandle handle = sessions.remove(sessionId);
            if (handle != null) {
                disconnectQuietly(handle);
                emitStatus(handle, SshStatus.DISCONNECTED);
            }
        }
        terminalExecutor.shutdownNow();
    }

    private SshConnectionSpec resolveConnectionSpec(SshConnectRequest request) throws AppError {
        if (request == null) {
            throw validation("Missing ssh.connect params.", "params");
        }

        HostProfile profile = null;
        if (hasText(request.profileId())) {
            profile = profileStore.getProfile(request.profileId());
        }

        String sessionId = hasText(request.sessionId()) ? request.sessionId().trim() : prefixedId("ssh");
        String host = firstText(request.host(), profile == null ? null : profile.host());
        int port = request.port() == null ? profile == null ? 22 : profile.port() : request.port();
        String username = firstText(request.username(), profile == null ? null : profile.username());

        requireText(host, "host");
        requireText(username, "username");
        if (port <= 0 || port > 65535) {
            throw validation("Invalid SSH port.", "port");
        }

        AuthConfig profileAuth = profile == null ? null : profile.auth().normalized();
        String authType = firstText(request.authType(), profileAuth == null ? null : profileAuth.type(), "password");
        CredentialRecord credential = resolveCredential(profileAuth);

        String password = firstText(request.password(), credential == null ? null : credential.password());
        String privateKeyPath = firstText(request.privateKeyPath(), profileAuth == null ? null : profileAuth.privateKeyPath());
        String privateKeyContent = firstText(request.privateKeyContent(), credential == null ? null : credential.privateKeyContent());
        String passphrase = firstText(request.passphrase(), credential == null ? null : credential.passphrase());
        int timeout = request.connectTimeoutMs() == null ? DEFAULT_CONNECT_TIMEOUT_MS : request.connectTimeoutMs();

        return new SshConnectionSpec(
                sessionId,
                profile == null ? blankToNull(request.profileId()) : profile.id(),
                host,
                port,
                username,
                authType,
                password,
                privateKeyPath,
                privateKeyContent,
                passphrase,
                Math.max(1_000, timeout)
        );
    }

    private CredentialRecord resolveCredential(AuthConfig auth) throws AppError {
        if (auth == null || !hasText(auth.credentialRef())) {
            return null;
        }
        return vaultManager.getCredential(auth.credentialRef());
    }

    private void authenticate(SSHClient client, SshConnectionSpec spec) throws Exception {
        String authType = spec.authType();
        if ("privateKey".equals(authType)) {
            authenticatePrivateKey(client, spec);
            return;
        }
        if ("keyboardInteractive".equals(authType)) {
            authenticateKeyboardInteractive(client, spec);
            return;
        }
        authenticatePassword(client, spec);
    }

    private void authenticatePassword(SSHClient client, SshConnectionSpec spec) throws UserAuthException, TransportException {
        if (!hasText(spec.password())) {
            throw new UserAuthException("Password credential is required.");
        }
        client.authPassword(spec.username(), spec.password());
    }

    private void authenticateKeyboardInteractive(SSHClient client, SshConnectionSpec spec) throws UserAuthException, TransportException {
        if (!hasText(spec.password())) {
            throw new UserAuthException("Keyboard-interactive credential is required.");
        }
        PasswordFinder passwordFinder = PasswordUtils.createOneOff(spec.password().toCharArray());
        client.auth(spec.username(), new AuthKeyboardInteractive(new PasswordResponseProvider(passwordFinder)));
    }

    private void authenticatePrivateKey(SSHClient client, SshConnectionSpec spec) throws IOException {
        KeyProvider keyProvider;
        if (hasText(spec.privateKeyContent())) {
            OpenSSHKeyFile keyFile = new OpenSSHKeyFile();
            keyFile.init(new StringReader(spec.privateKeyContent()), null, passwordFinder(spec.passphrase()));
            keyProvider = keyFile;
        } else if (hasText(spec.privateKeyPath())) {
            Path keyPath = Path.of(spec.privateKeyPath().replaceFirst("^~", System.getProperty("user.home")));
            if (!Files.exists(keyPath)) {
                throw new UserAuthException("Private key file not found.");
            }
            keyProvider = client.loadKeys(keyPath.toString(), passwordFinder(spec.passphrase()));
        } else {
            throw new UserAuthException("Private key credential is required.");
        }
        client.authPublickey(spec.username(), keyProvider);
    }

    private PasswordFinder passwordFinder(String passphrase) {
        return hasText(passphrase) ? PasswordUtils.createOneOff(passphrase.toCharArray()) : null;
    }

    private TerminalChannel requireChannel(String sessionId, String channelId) throws AppError {
        SshSessionHandle handle = requireSession(requireText(sessionId, "sessionId"));
        String id = requireText(channelId, "channelId");
        TerminalChannel channel = handle.channel(id);
        if (channel == null) {
            throw new AppError(ErrorCode.SSH_TERMINAL_NOT_FOUND, "Terminal channel not found.", Map.of("channelId", id));
        }
        return channel;
    }

    private SshSessionHandle requireSession(String sessionId) throws AppError {
        String id = requireText(sessionId, "sessionId");
        SshSessionHandle handle = sessions.get(id);
        if (handle == null) {
            throw new AppError(ErrorCode.SSH_SESSION_NOT_FOUND, "SSH session not found.", Map.of("sessionId", id));
        }
        return handle;
    }

    private void disconnectQuietly(SshSessionHandle handle) {
        for (TerminalChannel channel : new ArrayList<>(handle.channels())) {
            channel.close();
        }
        try {
            handle.client().disconnect();
        } catch (IOException error) {
            LOGGER.debug("SSH disconnect failed sessionId={}", handle.spec().sessionId(), error);
        }
    }

    private void markFailed(SshSessionHandle handle, String code, String message) {
        handle.fail(code, message);
        eventSink.emit(IpcEvent.create("ssh.statusChanged", handle.view()));
        LOGGER.warn("ssh.connect sessionId={} profileId={} host={} port={} status=failed code={}",
                handle.spec().sessionId(), handle.spec().profileId(), maskHost(handle.spec().host()), handle.spec().port(), code);
    }

    private void emitStatus(SshSessionHandle handle, SshStatus status) {
        handle.status(status);
        eventSink.emit(IpcEvent.create("ssh.statusChanged", handle.view()));
    }

    private String readAll(InputStream stream) throws IOException {
        return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
    }

    private String readFuture(Future<String> future, String operationErrorCode) throws AppError {
        try {
            return future.get(500, TimeUnit.MILLISECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new AppError(operationErrorCode, "Interrupted while reading remote command output.");
        } catch (ExecutionException error) {
            throw new AppError(
                    operationErrorCode,
                    "Failed to read remote command output.",
                    Map.of("cause", error.getCause() == null ? error.getClass().getSimpleName() : error.getCause().getClass().getSimpleName())
            );
        } catch (TimeoutException error) {
            future.cancel(true);
            throw new AppError(operationErrorCode, "Timed out while reading remote command output.");
        }
    }

    private void closeCommandQuietly(Session.Command command) {
        try {
            command.close();
        } catch (IOException error) {
            LOGGER.debug("Remote command close failed", error);
        }
    }

    AppError mapConnectError(Exception error) {
        Throwable cause = rootCause(error);
        if (isAuthenticationError(error)) {
            return new AppError(ErrorCode.SSH_AUTH_FAILED, "Authentication failed.");
        }
        if (cause instanceof SocketTimeoutException) {
            return new AppError(ErrorCode.SSH_CONNECT_TIMEOUT, "SSH connection timed out.");
        }
        if (cause instanceof UnknownHostException || cause instanceof NoRouteToHostException || cause instanceof ConnectException) {
            return new AppError(ErrorCode.SSH_NETWORK_UNREACHABLE, "SSH network is unreachable.");
        }
        if (error instanceof TransportException || error instanceof SSHException) {
            return new AppError(ErrorCode.SSH_NETWORK_UNREACHABLE, "SSH connection failed.");
        }
        return new AppError(
                ErrorCode.SSH_NETWORK_UNREACHABLE,
                "SSH connection failed.",
                Map.of("cause", error.getClass().getSimpleName())
        );
    }

    private Throwable rootCause(Throwable error) {
        Throwable current = error;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        return current;
    }

    private boolean isAuthenticationError(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof UserAuthException) {
                return true;
            }
            if (current instanceof SSHException sshException && isAuthenticationDisconnect(sshException.getDisconnectReason())) {
                return true;
            }
            String message = current.getMessage();
            if (message != null) {
                String normalized = message.toLowerCase(Locale.ROOT);
                if (normalized.contains("auth")
                        || normalized.contains("permission denied")
                        || normalized.contains("no more auth methods")) {
                    return true;
                }
            }
            current = current.getCause();
        }
        return false;
    }

    private boolean isAuthenticationDisconnect(DisconnectReason reason) {
        return reason == DisconnectReason.AUTH_CANCELLED_BY_USER
                || reason == DisconnectReason.NO_MORE_AUTH_METHODS_AVAILABLE
                || reason == DisconnectReason.ILLEGAL_USER_NAME;
    }

    private AppError validation(String message, String field) {
        return new AppError(ErrorCode.SSH_VALIDATION_FAILED, message, Map.of("field", field));
    }

    private String requireText(String value, String field) throws AppError {
        if (!hasText(value)) {
            throw validation("Missing required SSH field: " + field, field);
        }
        return value.trim();
    }

    private String firstText(String... values) {
        for (String value : values) {
            if (hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private String blankToNull(String value) {
        return hasText(value) ? value.trim() : null;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private String prefixedId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "");
    }

    private int normalizeDimension(Integer value, int fallback) {
        if (value == null || value < 1) {
            return fallback;
        }
        return Math.min(value, 500);
    }

    private int normalizePixelDimension(Integer value) {
        if (value == null || value < 0) {
            return 0;
        }
        return value;
    }

    private String maskHost(String host) {
        if (!hasText(host)) {
            return "-";
        }
        int lastDot = host.lastIndexOf('.');
        if (lastDot > 0) {
            return host.substring(0, lastDot) + ".*";
        }
        return "***";
    }

    private static ThreadFactory daemonThreadFactory() {
        return runnable -> {
            Thread thread = new Thread(runnable, "termira-terminal-io");
            thread.setDaemon(true);
            return thread;
        };
    }
}
