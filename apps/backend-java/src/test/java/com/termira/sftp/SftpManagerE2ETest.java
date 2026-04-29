package com.termira.sftp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.termira.ipc.IpcEvent;
import com.termira.profile.ProfileStore;
import com.termira.ssh.SshConnectRequest;
import com.termira.ssh.SshDisconnectRequest;
import com.termira.ssh.SshSessionManager;
import com.termira.ssh.SshSessionView;
import com.termira.ssh.SshStatus;
import com.termira.vault.VaultManager;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SftpManagerE2ETest {
    @TempDir
    Path tempDir;

    @Test
    void managesRemoteFilesAgainstEnvHost() throws Exception {
        String host = System.getenv("TERMIRA_E2E_SSH_HOST");
        String username = System.getenv("TERMIRA_E2E_SSH_USER");
        String password = System.getenv("TERMIRA_E2E_SSH_PASSWORD");
        assumeTrue(hasText(host) && hasText(username) && hasText(password), "TERMIRA_E2E_SSH_* env vars are required.");

        List<IpcEvent> events = Collections.synchronizedList(new ArrayList<>());
        ProfileStore profileStore = new ProfileStore(tempDir.resolve("profiles.db"));
        VaultManager vaultManager = new VaultManager(tempDir.resolve("vault.dat"), tempDir.resolve("vault.local.key"));
        SshSessionManager sshManager = new SshSessionManager(profileStore, vaultManager, events::add);
        SftpManager sftpManager = new SftpManager(sshManager, events::add);

        SshSessionView session = null;
        String remoteDir = null;
        try {
            session = sshManager.connect(new SshConnectRequest(
                    null,
                    "ssh_sftp_e2e",
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

            SftpOpenResult open = sftpManager.open(new SftpOpenRequest(session.sessionId(), "."));
            assertThat(open.path()).isNotBlank();
            SftpOpenResult home = sftpManager.open(new SftpOpenRequest(session.sessionId(), "~"));
            assertThat(home.path()).isEqualTo(open.path());

            remoteDir = joinRemote(open.path(), "termira-sftp-e2e-" + System.currentTimeMillis());
            String createdRemoteDir = remoteDir;
            sftpManager.mkdir(new SftpMkdirRequest(session.sessionId(), remoteDir));
            assertThat(sftpManager.list(new SftpListRequest(session.sessionId(), open.path())).entries())
                    .anyMatch(entry -> entry.directory() && entry.path().equals(createdRemoteDir));

            Path uploadSource = tempDir.resolve("sample.txt");
            Files.writeString(uploadSource, "Termira SFTP E2E\n" + Instant.now(), StandardCharsets.UTF_8);
            long uploadSize = Files.size(uploadSource);
            String remoteFile = joinRemote(remoteDir, "sample.txt");
            TransferView upload = sftpManager.upload(new SftpUploadRequest(session.sessionId(), uploadSource.toString(), remoteFile));
            TransferView uploaded = waitForTransfer(events, upload.transferId(), Duration.ofSeconds(20));
            assertThat(uploaded.status()).isEqualTo("completed");
            assertThat(uploaded.percent()).isEqualTo(100);

            SftpListResult remoteList = sftpManager.list(new SftpListRequest(session.sessionId(), remoteDir));
            assertThat(remoteList.entries())
                    .anyMatch(entry -> entry.regularFile()
                            && entry.name().equals("sample.txt")
                            && entry.size() == uploadSize);

            Path downloadTarget = tempDir.resolve("downloaded.txt");
            TransferView download = sftpManager.download(new SftpDownloadRequest(session.sessionId(), remoteFile, downloadTarget.toString()));
            TransferView downloaded = waitForTransfer(events, download.transferId(), Duration.ofSeconds(20));
            assertThat(downloaded.status()).isEqualTo("completed");
            assertThat(Files.readString(downloadTarget, StandardCharsets.UTF_8)).isEqualTo(Files.readString(uploadSource, StandardCharsets.UTF_8));

            String renamedFile = joinRemote(remoteDir, "renamed.txt");
            sftpManager.rename(new SftpRenameRequest(session.sessionId(), remoteFile, renamedFile));
            assertThat(sftpManager.list(new SftpListRequest(session.sessionId(), remoteDir)).entries())
                    .anyMatch(entry -> entry.name().equals("renamed.txt"));

            sftpManager.remove(new SftpRemoveRequest(session.sessionId(), renamedFile, false));
            sftpManager.remove(new SftpRemoveRequest(session.sessionId(), remoteDir, true));
            assertThat(sftpManager.list(new SftpListRequest(session.sessionId(), open.path())).entries())
                    .noneMatch(entry -> entry.path().equals(createdRemoteDir));
        } finally {
            if (session != null) {
                if (remoteDir != null) {
                    SshSessionView connectedSession = session;
                    String cleanupRemoteDir = remoteDir;
                    ignore(() -> sftpManager.remove(new SftpRemoveRequest(connectedSession.sessionId(), joinRemote(cleanupRemoteDir, "renamed.txt"), false)));
                    ignore(() -> sftpManager.remove(new SftpRemoveRequest(connectedSession.sessionId(), joinRemote(cleanupRemoteDir, "sample.txt"), false)));
                    ignore(() -> sftpManager.remove(new SftpRemoveRequest(connectedSession.sessionId(), cleanupRemoteDir, true)));
                }
                sshManager.disconnect(new SshDisconnectRequest(session.sessionId()));
            }
            sftpManager.close();
            sshManager.close();
        }
    }

    private static TransferView waitForTransfer(List<IpcEvent> events, String transferId, Duration timeout) throws InterruptedException {
        Instant deadline = Instant.now().plus(timeout);
        while (Instant.now().isBefore(deadline)) {
            synchronized (events) {
                for (IpcEvent event : events) {
                    if (("transfer.completed".equals(event.event()) || "transfer.failed".equals(event.event()))
                            && event.payload() instanceof TransferView transfer
                            && transfer.transferId().equals(transferId)) {
                        return transfer;
                    }
                }
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Timed out waiting for SFTP transfer: " + transferId);
    }

    private static String joinRemote(String basePath, String name) {
        if ("/".equals(basePath)) {
            return "/" + name;
        }
        return basePath.replaceAll("/+$", "") + "/" + name;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static void ignore(ThrowingRunnable runnable) {
        try {
            runnable.run();
        } catch (Exception ignored) {
        }
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws Exception;
    }
}
