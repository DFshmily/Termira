package com.termira.monitor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.termira.error.ErrorCode;
import com.termira.processes.ProcessKillRequest;
import com.termira.processes.ProcessListRequest;
import com.termira.processes.ProcessListResult;
import com.termira.processes.ProcessManager;
import com.termira.profile.ProfileStore;
import com.termira.ssh.RemoteCommandResult;
import com.termira.ssh.SshConnectRequest;
import com.termira.ssh.SshDisconnectRequest;
import com.termira.ssh.SshSessionManager;
import com.termira.ssh.SshSessionView;
import com.termira.ssh.SshStatus;
import com.termira.vault.VaultManager;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class MonitorProcessE2ETest {
    @TempDir
    Path tempDir;

    @Test
    void collectsMonitorAndManagesProcessAgainstEnvHost() throws Exception {
        String host = System.getenv("TERMIRA_E2E_SSH_HOST");
        String username = System.getenv("TERMIRA_E2E_SSH_USER");
        String password = System.getenv("TERMIRA_E2E_SSH_PASSWORD");
        assumeTrue(hasText(host) && hasText(username) && hasText(password), "TERMIRA_E2E_SSH_* env vars are required.");

        ProfileStore profileStore = new ProfileStore(tempDir.resolve("profiles.db"));
        VaultManager vaultManager = new VaultManager(tempDir.resolve("vault.dat"), tempDir.resolve("vault.local.key"));
        SshSessionManager sshManager = new SshSessionManager(profileStore, vaultManager, event -> {
        });
        MonitorManager monitorManager = new MonitorManager(sshManager, event -> {
        });
        ProcessManager processManager = new ProcessManager(sshManager, event -> {
        });
        SshSessionView session = null;
        Long sleeperPid = null;

        try {
            session = sshManager.connect(new SshConnectRequest(
                    null,
                    "monitor_process_e2e",
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

            MonitorSnapshot snapshot = monitorManager.snapshot(new MonitorRequest(session.sessionId(), null));
            assertThat(snapshot.available()).isTrue();
            assertThat(snapshot.cpu().totalTicks()).isPositive();
            assertThat(snapshot.memory().totalBytes()).isPositive();
            assertThat(snapshot.disk().totalBytes()).isPositive();
            assertThat(snapshot.uptimeSeconds()).isPositive();

            ProcessListResult processes = processManager.list(new ProcessListRequest(session.sessionId()));
            assertThat(processes.processes()).isNotEmpty();
            assertThat(processes.processes()).allMatch(process -> process.pid() > 0 && hasText(process.command()));

            RemoteCommandResult sleeper = sshManager.exec(
                    session.sessionId(),
                    "sh -lc 'nohup sleep 60 >/dev/null 2>&1 & echo $!'",
                    2_000,
                    ErrorCode.PROCESS_NOT_CONNECTED,
                    ErrorCode.PROCESS_OPERATION_FAILED
            );
            sleeperPid = Long.parseLong(sleeper.stdout().trim());
            processManager.kill(new ProcessKillRequest(session.sessionId(), sleeperPid, "TERM"));
            Thread.sleep(350);

            RemoteCommandResult check = sshManager.exec(
                    session.sessionId(),
                    "kill -0 " + sleeperPid,
                    2_000,
                    ErrorCode.PROCESS_NOT_CONNECTED,
                    ErrorCode.PROCESS_OPERATION_FAILED
            );
            assertThat(check.exitStatus()).isNotZero();
        } finally {
            if (session != null && sleeperPid != null) {
                try {
                    processManager.kill(new ProcessKillRequest(session.sessionId(), sleeperPid, "KILL"));
                } catch (Exception ignored) {
                }
            }
            monitorManager.close();
            if (session != null) {
                sshManager.disconnect(new SshDisconnectRequest(session.sessionId()));
            }
            sshManager.close();
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
