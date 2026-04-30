package com.termira.ssh;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import com.termira.ipc.IpcEvent;
import com.termira.profile.ProfileStore;
import com.termira.vault.VaultManager;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SshSessionManagerE2ETest {
    @TempDir
    Path tempDir;

    @Test
    void connectsAndRunsInteractiveShellAgainstEnvHost() throws Exception {
        String host = System.getenv("TERMIRA_E2E_SSH_HOST");
        String username = System.getenv("TERMIRA_E2E_SSH_USER");
        String password = System.getenv("TERMIRA_E2E_SSH_PASSWORD");
        assumeTrue(hasText(host) && hasText(username) && hasText(password), "TERMIRA_E2E_SSH_* env vars are required.");

        StringBuilder output = new StringBuilder();
        ProfileStore profileStore = new ProfileStore(tempDir.resolve("profiles.db"));
        VaultManager vaultManager = new VaultManager(tempDir.resolve("vault.dat"), tempDir.resolve("vault.local.key"));
        SshSessionManager manager = new SshSessionManager(profileStore, vaultManager, event -> appendTerminalOutput(event, output));

        try {
            SshSessionView session = manager.connect(new SshConnectRequest(
                    null,
                    "ssh_e2e",
                    host,
                    22,
                    username,
                    "password",
                    password,
                    null,
                    null,
                    null,
                    20_000
            ));
            assertThat(session.status()).isEqualTo(SshStatus.CONNECTED);

            Map<String, Object> shell = manager.openShell(new TerminalOpenShellRequest(session.sessionId(), "chan_e2e", 120, 40, "xterm-256color"));
            assertThat(shell.get("channelId")).isEqualTo("chan_e2e");

            manager.write(new TerminalWriteRequest(
                    session.sessionId(),
                    "chan_e2e",
                    "printf 'TERMIRA_WHOAMI:'; whoami; printf 'TERMIRA_PWD:'; pwd; ls >/dev/null; printf 'TERMIRA_LS_END\\n'\n"
            ));
            waitFor(output, "TERMIRA_LS_END", Duration.ofSeconds(10));
            manager.resize(new TerminalResizeRequest(session.sessionId(), "chan_e2e", 100, 32, null, null));

            String text = output.toString();
            assertThat(text).contains("TERMIRA_WHOAMI:" + username);
            assertThat(text).contains("TERMIRA_PWD:");
            assertThat(text).contains("TERMIRA_LS_END");

            manager.closeTerminal(new TerminalCloseRequest(session.sessionId(), "chan_e2e"));
            manager.disconnect(new SshDisconnectRequest(session.sessionId()));
        } finally {
            manager.close();
        }
    }

    @Test
    void connectsWithPrivateKeyAgainstEnvHost() throws Exception {
        String host = System.getenv("TERMIRA_E2E_SSH_HOST");
        String username = System.getenv("TERMIRA_E2E_SSH_USER");
        String privateKeyPath = System.getenv("TERMIRA_E2E_SSH_PRIVATE_KEY_PATH");
        String passphrase = System.getenv("TERMIRA_E2E_SSH_PRIVATE_KEY_PASSPHRASE");
        assumeTrue(hasText(host) && hasText(username) && hasText(privateKeyPath), "TERMIRA_E2E_SSH_PRIVATE_KEY_PATH is required.");

        ProfileStore profileStore = new ProfileStore(tempDir.resolve("private-key-profiles.db"));
        VaultManager vaultManager = new VaultManager(tempDir.resolve("private-key-vault.dat"), tempDir.resolve("private-key-vault.local.key"));
        SshSessionManager manager = new SshSessionManager(profileStore, vaultManager, event -> {
        });

        try {
            SshSessionView session = manager.connect(new SshConnectRequest(
                    null,
                    "ssh_private_key_e2e",
                    host,
                    22,
                    username,
                    "privateKey",
                    null,
                    privateKeyPath,
                    null,
                    passphrase,
                    20_000
            ));
            assertThat(session.status()).isEqualTo(SshStatus.CONNECTED);

            RemoteCommandResult result = manager.exec(
                    session.sessionId(),
                    "hostname",
                    10_000,
                    ErrorCode.PROCESS_NOT_CONNECTED,
                    ErrorCode.PROCESS_OPERATION_FAILED
            );
            assertThat(result.exitStatus()).isZero();
            assertThat(result.stdout().trim()).isNotEmpty();

            manager.disconnect(new SshDisconnectRequest(session.sessionId()));
        } finally {
            manager.close();
        }
    }

    @Test
    void mapsInvalidPasswordToAuthFailedAgainstEnvHost() {
        String host = System.getenv("TERMIRA_E2E_SSH_HOST");
        String username = System.getenv("TERMIRA_E2E_SSH_USER");
        assumeTrue(hasText(host) && hasText(username), "TERMIRA_E2E_SSH_HOST and TERMIRA_E2E_SSH_USER are required.");

        ProfileStore profileStore = new ProfileStore(tempDir.resolve("auth-failed-profiles.db"));
        VaultManager vaultManager = new VaultManager(tempDir.resolve("auth-failed-vault.dat"), tempDir.resolve("auth-failed-vault.local.key"));
        SshSessionManager manager = new SshSessionManager(profileStore, vaultManager, event -> {
        });

        try {
            assertThatThrownBy(() -> manager.connect(new SshConnectRequest(
                    null,
                    "ssh_auth_failed_e2e",
                    host,
                    22,
                    username,
                    "password",
                    "definitely-not-the-right-password",
                    null,
                    null,
                    null,
                    20_000
            )))
                    .isInstanceOfSatisfying(AppError.class, error ->
                            assertThat(error.code()).isEqualTo(ErrorCode.SSH_AUTH_FAILED));
        } finally {
            manager.close();
        }
    }

    private static void appendTerminalOutput(IpcEvent event, StringBuilder output) {
        if (!"terminal.output".equals(event.event()) || !(event.payload() instanceof Map<?, ?> payload)) {
            return;
        }
        Object data = payload.get("data");
        if (data instanceof String text) {
            synchronized (output) {
                output.append(text);
            }
        }
    }

    private static void waitFor(StringBuilder output, String token, Duration timeout) throws InterruptedException {
        Instant deadline = Instant.now().plus(timeout);
        while (Instant.now().isBefore(deadline)) {
            synchronized (output) {
                if (output.toString().contains(token)) {
                    return;
                }
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Timed out waiting for terminal output token: " + token);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
