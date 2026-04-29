package com.termira.vault;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class VaultManagerTest {
    @TempDir
    Path tempDir;

    @Test
    void savesCredentialsEncryptedAndRejectsWrongMasterPassword() throws Exception {
        Path vaultPath = tempDir.resolve("vault.dat");
        VaultManager vault = new VaultManager(vaultPath, tempDir.resolve("vault.local.key"));

        vault.init(new VaultInitRequest("master-password", "correct horse battery staple"));
        CredentialMetadata metadata = vault.saveCredential(new CredentialInput(
                null,
                "password",
                "super-secret-password",
                null,
                null
        ));
        String vaultFile = Files.readString(vaultPath, StandardCharsets.UTF_8);

        assertThat(vaultFile).contains("\"schemaVersion\" : 1");
        assertThat(vaultFile).contains("PBKDF2WithHmacSHA256");
        assertThat(vaultFile).contains("AES-256-GCM");
        assertThat(vaultFile).doesNotContain("super-secret-password");

        vault.lock();
        assertThatThrownBy(() -> vault.unlock("wrong password"))
                .isInstanceOf(AppError.class)
                .extracting(error -> ((AppError) error).code())
                .isEqualTo(ErrorCode.VAULT_UNLOCK_FAILED);

        vault.unlock("correct horse battery staple");
        assertThat(vault.getCredential(metadata.credentialId()).password()).isEqualTo("super-secret-password");
    }

    @Test
    void localKeyModeAutoUnlocksOnRestart() throws Exception {
        Path vaultPath = tempDir.resolve("vault.dat");
        Path keyPath = tempDir.resolve("vault.local.key");
        VaultManager vault = new VaultManager(vaultPath, keyPath);

        vault.init(new VaultInitRequest("local-key", null));
        CredentialMetadata metadata = vault.saveCredential(new CredentialInput(
                "cred_local",
                "privateKey",
                null,
                "key-passphrase",
                "-----BEGIN PRIVATE KEY-----\nredacted\n-----END PRIVATE KEY-----"
        ));

        VaultManager reloaded = new VaultManager(vaultPath, keyPath);
        assertThat(reloaded.status().locked()).isFalse();
        assertThat(reloaded.getCredential(metadata.credentialId()).passphrase()).isEqualTo("key-passphrase");
    }

    @Test
    void reinitializingUnlockedVaultReencryptsWithoutDroppingCredentials() throws Exception {
        Path vaultPath = tempDir.resolve("vault.dat");
        Path keyPath = tempDir.resolve("vault.local.key");
        VaultManager vault = new VaultManager(vaultPath, keyPath);

        vault.init(new VaultInitRequest("local-key", null));
        CredentialMetadata metadata = vault.saveCredential(new CredentialInput(
                "cred_migrate",
                "password",
                "preserved-password",
                null,
                null
        ));

        vault.init(new VaultInitRequest("master-password", "new master password"));
        vault.lock();
        vault.unlock("new master password");

        assertThat(vault.getCredential(metadata.credentialId()).password()).isEqualTo("preserved-password");
    }

    @Test
    void corruptedVaultIsNotOverwrittenByStatus() throws Exception {
        Path vaultPath = tempDir.resolve("vault.dat");
        Files.writeString(vaultPath, "{broken", StandardCharsets.UTF_8);
        VaultManager vault = new VaultManager(vaultPath, tempDir.resolve("vault.local.key"));

        assertThatThrownBy(vault::status).isInstanceOf(AppError.class);
        assertThat(Files.readString(vaultPath, StandardCharsets.UTF_8)).isEqualTo("{broken");
    }
}
