package com.termira.vault;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermission;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

public final class VaultManager {
    private static final int SCHEMA_VERSION = 1;
    private static final String KDF_NAME = "PBKDF2WithHmacSHA256";
    private static final String CIPHER_NAME = "AES-256-GCM";
    private static final int PBKDF2_ITERATIONS = 210_000;
    private static final int KEY_BITS = 256;
    private static final int SALT_BYTES = 16;
    private static final int NONCE_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;
    private static final Set<String> CREDENTIAL_TYPES = Set.of("password", "privateKey", "keyboardInteractive");

    private final Path vaultPath;
    private final Path localKeyPath;
    private final ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
    private final SecureRandom secureRandom = new SecureRandom();
    private final Object lock = new Object();

    private VaultPayload unlockedPayload;
    private char[] unlockedKeyMaterial;
    private VaultFile currentFile;

    public VaultManager(Path vaultPath, Path localKeyPath) {
        this.vaultPath = vaultPath;
        this.localKeyPath = localKeyPath;
        this.mapper.setSerializationInclusion(JsonInclude.Include.NON_NULL);
        tryAutoUnlockLocalVault();
    }

    public VaultStatus status() throws AppError {
        synchronized (lock) {
            VaultFile file = loadVaultFileIfExists().orElse(null);
            if (file == null) {
                return new VaultStatus(false, true, null, 0, 0, null, null, vaultPath.toString());
            }
            currentFile = file;
            return new VaultStatus(
                    true,
                    unlockedPayload == null,
                    file.mode,
                    file.schemaVersion,
                    unlockedPayload == null ? 0 : unlockedPayload.credentials.size(),
                    file.kdf == null ? null : file.kdf.name,
                    file.cipher == null ? null : file.cipher.name,
                    vaultPath.toString()
            );
        }
    }

    public VaultStatus init(VaultInitRequest request) throws AppError {
        synchronized (lock) {
            String mode = normalizeMode(request == null ? null : request.mode());
            char[] keyMaterial = keyMaterialForInit(mode, request == null ? null : request.masterPassword());
            VaultPayload payload;
            if (Files.exists(vaultPath)) {
                if (unlockedPayload == null) {
                    throw new AppError(ErrorCode.VAULT_LOCKED, "Vault is locked.");
                }
                payload = unlockedPayload;
            } else {
                payload = new VaultPayload();
                payload.credentials = new ArrayList<>();
            }
            writeEncryptedPayload(mode, keyMaterial, payload);
            unlockedPayload = payload;
            unlockedKeyMaterial = keyMaterial.clone();
            currentFile = loadVaultFile();
            return status();
        }
    }

    public VaultStatus unlock(String masterPassword) throws AppError {
        synchronized (lock) {
            VaultFile file = loadVaultFile();
            char[] keyMaterial = keyMaterialForUnlock(file.mode, masterPassword);
            try {
                unlockedPayload = decryptPayload(file, keyMaterial);
                unlockedKeyMaterial = keyMaterial.clone();
                currentFile = file;
                return status();
            } catch (AppError error) {
                throw error;
            }
        }
    }

    public VaultStatus lock() throws AppError {
        synchronized (lock) {
            unlockedPayload = null;
            unlockedKeyMaterial = null;
            currentFile = loadVaultFileIfExists().orElse(currentFile);
            return status();
        }
    }

    public CredentialMetadata saveCredential(CredentialInput input) throws AppError {
        synchronized (lock) {
            VaultPayload payload = requireUnlockedPayload();
            CredentialInput normalized = normalizeCredentialInput(input);
            String credentialId = hasText(normalized.credentialId()) ? normalized.credentialId() : prefixedId("cred");
            String now = Instant.now().toString();

            Optional<CredentialRecord> existing = payload.credentials.stream()
                    .filter(credential -> credential.credentialId().equals(credentialId))
                    .findFirst();
            CredentialRecord record = new CredentialRecord(
                    credentialId,
                    normalized.type(),
                    blankToNull(normalized.password()),
                    blankToNull(normalized.passphrase()),
                    blankToNull(normalized.privateKeyContent()),
                    existing.map(CredentialRecord::createdAt).orElse(now),
                    now
            );

            payload.credentials.removeIf(credential -> credential.credentialId().equals(credentialId));
            payload.credentials.add(record);
            payload.credentials.sort(Comparator.comparing(CredentialRecord::credentialId));
            persistUnlockedPayload();
            return record.metadata();
        }
    }

    public CredentialRecord getCredential(String credentialId) throws AppError {
        synchronized (lock) {
            requireText(credentialId, "credentialId");
            VaultPayload payload = requireUnlockedPayload();
            return payload.credentials.stream()
                    .filter(credential -> credential.credentialId().equals(credentialId))
                    .findFirst()
                    .orElseThrow(() -> new AppError(
                            ErrorCode.CREDENTIAL_NOT_FOUND,
                            "Credential not found.",
                            Map.of("credentialId", credentialId)
                    ));
        }
    }

    public boolean deleteCredential(String credentialId) throws AppError {
        synchronized (lock) {
            requireText(credentialId, "credentialId");
            VaultPayload payload = requireUnlockedPayload();
            boolean removed = payload.credentials.removeIf(credential -> credential.credentialId().equals(credentialId));
            if (removed) {
                persistUnlockedPayload();
            }
            return removed;
        }
    }

    public boolean testDecrypt(String credentialId) throws AppError {
        getCredential(credentialId);
        return true;
    }

    private void tryAutoUnlockLocalVault() {
        synchronized (lock) {
            try {
                Optional<VaultFile> maybeFile = loadVaultFileIfExists();
                if (maybeFile.isEmpty() || !"local-key".equals(maybeFile.get().mode)) {
                    return;
                }
                VaultFile file = maybeFile.get();
                char[] keyMaterial = readLocalKeyMaterial();
                unlockedPayload = decryptPayload(file, keyMaterial);
                unlockedKeyMaterial = keyMaterial.clone();
                currentFile = file;
            } catch (AppError ignored) {
                unlockedPayload = null;
            }
        }
    }

    private void persistUnlockedPayload() throws AppError {
        VaultFile file = currentFile == null ? loadVaultFile() : currentFile;
        char[] keyMaterial = unlockedKeyMaterial == null ? keyMaterialForUnlock(file.mode, null) : unlockedKeyMaterial;
        writeEncryptedPayload(file.mode, keyMaterial, unlockedPayload);
        currentFile = loadVaultFile();
    }

    private void writeEncryptedPayload(String mode, char[] keyMaterial, VaultPayload payload) throws AppError {
        try {
            Files.createDirectories(vaultPath.toAbsolutePath().getParent());
            byte[] salt = randomBytes(SALT_BYTES);
            byte[] nonce = randomBytes(NONCE_BYTES);
            byte[] key = deriveKey(keyMaterial, salt, PBKDF2_ITERATIONS);
            byte[] plaintext = mapper.writeValueAsBytes(payload);
            byte[] encrypted = encrypt(key, nonce, plaintext);

            VaultFile file = new VaultFile();
            file.schemaVersion = SCHEMA_VERSION;
            file.mode = mode;
            file.kdf = new KdfConfig();
            file.kdf.name = KDF_NAME;
            file.kdf.params = Map.of(
                    "iterations", PBKDF2_ITERATIONS,
                    "keyBits", KEY_BITS,
                    "saltBytes", SALT_BYTES
            );
            file.kdf.salt = base64(salt);
            file.cipher = new CipherConfig();
            file.cipher.name = CIPHER_NAME;
            file.cipher.nonce = base64(nonce);
            file.payload = base64(encrypted);

            Path tempFile = vaultPath.resolveSibling(vaultPath.getFileName() + ".tmp");
            mapper.writerWithDefaultPrettyPrinter().writeValue(tempFile.toFile(), file);
            trySetOwnerOnlyPermissions(tempFile);
            Files.move(tempFile, vaultPath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            trySetOwnerOnlyPermissions(vaultPath);
        } catch (IOException | GeneralSecurityException error) {
            throw new AppError(
                    ErrorCode.VAULT_STORAGE_ERROR,
                    "Vault write failed.",
                    Map.of("cause", error.getClass().getSimpleName())
            );
        }
    }

    private VaultPayload decryptPayload(VaultFile file, char[] keyMaterial) throws AppError {
        validateVaultFile(file);
        try {
            byte[] salt = fromBase64(file.kdf.salt);
            byte[] nonce = fromBase64(file.cipher.nonce);
            byte[] encrypted = fromBase64(file.payload);
            int iterations = ((Number) file.kdf.params.getOrDefault("iterations", PBKDF2_ITERATIONS)).intValue();
            byte[] key = deriveKey(keyMaterial, salt, iterations);
            byte[] plaintext = decrypt(key, nonce, encrypted);
            VaultPayload payload = mapper.readValue(plaintext, VaultPayload.class);
            if (payload.credentials == null) {
                payload.credentials = new ArrayList<>();
            }
            return payload;
        } catch (AEADBadTagException error) {
            throw new AppError(ErrorCode.VAULT_UNLOCK_FAILED, "Vault unlock failed.");
        } catch (IOException | IllegalArgumentException | GeneralSecurityException error) {
            throw new AppError(
                    ErrorCode.VAULT_STORAGE_ERROR,
                    "Vault read failed.",
                    Map.of("cause", error.getClass().getSimpleName())
            );
        }
    }

    private VaultPayload requireUnlockedPayload() throws AppError {
        if (!Files.exists(vaultPath)) {
            throw new AppError(ErrorCode.VAULT_NOT_INITIALIZED, "Vault is not initialized.");
        }
        if (unlockedPayload == null) {
            throw new AppError(ErrorCode.VAULT_LOCKED, "Vault is locked.");
        }
        return unlockedPayload;
    }

    private VaultFile loadVaultFile() throws AppError {
        return loadVaultFileIfExists().orElseThrow(() ->
                new AppError(ErrorCode.VAULT_NOT_INITIALIZED, "Vault is not initialized."));
    }

    private Optional<VaultFile> loadVaultFileIfExists() throws AppError {
        if (!Files.exists(vaultPath)) {
            return Optional.empty();
        }
        try {
            VaultFile file = mapper.readValue(vaultPath.toFile(), VaultFile.class);
            validateVaultFile(file);
            return Optional.of(file);
        } catch (IOException | IllegalArgumentException error) {
            throw new AppError(
                    ErrorCode.VAULT_STORAGE_ERROR,
                    "Vault read failed.",
                    Map.of("cause", error.getClass().getSimpleName())
            );
        }
    }

    private void validateVaultFile(VaultFile file) throws AppError {
        if (file == null
                || file.schemaVersion != SCHEMA_VERSION
                || file.kdf == null
                || file.cipher == null
                || !KDF_NAME.equals(file.kdf.name)
                || !CIPHER_NAME.equals(file.cipher.name)
                || !hasText(file.kdf.salt)
                || !hasText(file.cipher.nonce)
                || !hasText(file.payload)
                || (!"local-key".equals(file.mode) && !"master-password".equals(file.mode))) {
            throw new AppError(ErrorCode.VAULT_STORAGE_ERROR, "Vault file is invalid.");
        }
    }

    private char[] keyMaterialForInit(String mode, String masterPassword) throws AppError {
        if ("master-password".equals(mode)) {
            requireText(masterPassword, "masterPassword");
            return masterPassword.toCharArray();
        }
        return ensureLocalKeyMaterial();
    }

    private char[] keyMaterialForUnlock(String mode, String masterPassword) throws AppError {
        if ("master-password".equals(mode)) {
            requireText(masterPassword, "masterPassword");
            return masterPassword.toCharArray();
        }
        return readLocalKeyMaterial();
    }

    private char[] ensureLocalKeyMaterial() throws AppError {
        if (Files.exists(localKeyPath)) {
            return readLocalKeyMaterial();
        }
        try {
            Files.createDirectories(localKeyPath.toAbsolutePath().getParent());
            String key = base64(randomBytes(32));
            Files.writeString(
                    localKeyPath,
                    key,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE_NEW,
                    StandardOpenOption.WRITE
            );
            trySetOwnerOnlyPermissions(localKeyPath);
            return key.toCharArray();
        } catch (IOException error) {
            throw new AppError(
                    ErrorCode.VAULT_STORAGE_ERROR,
                    "Local vault key write failed.",
                    Map.of("cause", error.getClass().getSimpleName())
            );
        }
    }

    private char[] readLocalKeyMaterial() throws AppError {
        try {
            if (!Files.exists(localKeyPath)) {
                throw new AppError(ErrorCode.VAULT_UNLOCK_FAILED, "Vault unlock failed.");
            }
            return Files.readString(localKeyPath, StandardCharsets.UTF_8).trim().toCharArray();
        } catch (IOException error) {
            throw new AppError(
                    ErrorCode.VAULT_STORAGE_ERROR,
                    "Local vault key read failed.",
                    Map.of("cause", error.getClass().getSimpleName())
            );
        }
    }

    private CredentialInput normalizeCredentialInput(CredentialInput input) throws AppError {
        if (input == null) {
            throw new AppError(ErrorCode.CREDENTIAL_VALIDATION_FAILED, "Credential input is required.");
        }
        String type = hasText(input.type()) ? input.type() : "password";
        if (!CREDENTIAL_TYPES.contains(type)) {
            throw new AppError(ErrorCode.CREDENTIAL_VALIDATION_FAILED, "Unsupported credential type.");
        }
        if (!hasText(input.password()) && !hasText(input.passphrase()) && !hasText(input.privateKeyContent())) {
            throw new AppError(ErrorCode.CREDENTIAL_VALIDATION_FAILED, "Credential secret is required.");
        }
        return new CredentialInput(
                blankToNull(input.credentialId()),
                type,
                blankToNull(input.password()),
                blankToNull(input.passphrase()),
                blankToNull(input.privateKeyContent())
        );
    }

    private String normalizeMode(String mode) throws AppError {
        if (!hasText(mode) || "local-key".equals(mode)) {
            return "local-key";
        }
        if ("master-password".equals(mode)) {
            return "master-password";
        }
        throw new AppError(ErrorCode.VAULT_VALIDATION_FAILED, "Unsupported vault mode.");
    }

    private byte[] deriveKey(char[] keyMaterial, byte[] salt, int iterations) throws GeneralSecurityException {
        PBEKeySpec spec = new PBEKeySpec(keyMaterial, salt, iterations, KEY_BITS);
        try {
            return SecretKeyFactory.getInstance(KDF_NAME).generateSecret(spec).getEncoded();
        } finally {
            spec.clearPassword();
        }
    }

    private byte[] encrypt(byte[] key, byte[] nonce, byte[] plaintext) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(GCM_TAG_BITS, nonce));
        return cipher.doFinal(plaintext);
    }

    private byte[] decrypt(byte[] key, byte[] nonce, byte[] encrypted) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(GCM_TAG_BITS, nonce));
        return cipher.doFinal(encrypted);
    }

    private byte[] randomBytes(int size) {
        byte[] bytes = new byte[size];
        secureRandom.nextBytes(bytes);
        return bytes;
    }

    private void trySetOwnerOnlyPermissions(Path path) {
        try {
            Files.setPosixFilePermissions(path, Set.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE
            ));
        } catch (UnsupportedOperationException | IOException ignored) {
            // Windows and some packaged environments do not support POSIX permissions.
        }
    }

    private void requireText(String value, String field) throws AppError {
        if (!hasText(value)) {
            String code = "masterPassword".equals(field) ? ErrorCode.VAULT_UNLOCK_FAILED : ErrorCode.VAULT_VALIDATION_FAILED;
            throw new AppError(code, field + " is required.");
        }
    }

    private static byte[] fromBase64(String value) {
        return Base64.getDecoder().decode(value);
    }

    private static String base64(byte[] bytes) {
        return Base64.getEncoder().encodeToString(bytes);
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

    @SuppressWarnings("unused")
    private static boolean constantTimeEquals(byte[] left, byte[] right) {
        return MessageDigest.isEqual(left, right);
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private static final class VaultFile {
        public int schemaVersion;
        public KdfConfig kdf;
        public CipherConfig cipher;
        public String mode;
        public String payload;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private static final class KdfConfig {
        public String name;
        public Map<String, Object> params = new HashMap<>();
        public String salt;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private static final class CipherConfig {
        public String name;
        public String nonce;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private static final class VaultPayload {
        public List<CredentialRecord> credentials = new ArrayList<>();
    }
}
