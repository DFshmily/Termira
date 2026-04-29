package com.termira.ssh;

import static org.assertj.core.api.Assertions.assertThat;

import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import com.termira.ipc.IpcEventSink;
import com.termira.profile.ProfileStore;
import com.termira.vault.VaultManager;
import java.net.ConnectException;
import java.nio.file.Path;
import net.schmizz.sshj.common.DisconnectReason;
import net.schmizz.sshj.transport.TransportException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SshSessionManagerTest {
    @TempDir
    Path tempDir;

    @Test
    void mapsSshjAuthDisconnectToAuthFailed() {
        SshSessionManager manager = manager();
        try {
            AppError error = manager.mapConnectError(new TransportException(
                    DisconnectReason.NO_MORE_AUTH_METHODS_AVAILABLE,
                    "Exhausted available authentication methods."
            ));

            assertThat(error.code()).isEqualTo(ErrorCode.SSH_AUTH_FAILED);
        } finally {
            manager.close();
        }
    }

    @Test
    void keepsSocketConnectFailureAsNetworkUnreachable() {
        SshSessionManager manager = manager();
        try {
            AppError error = manager.mapConnectError(new TransportException(new ConnectException("Connection refused")));

            assertThat(error.code()).isEqualTo(ErrorCode.SSH_NETWORK_UNREACHABLE);
        } finally {
            manager.close();
        }
    }

    private SshSessionManager manager() {
        return new SshSessionManager(
                new ProfileStore(tempDir.resolve("profiles.db")),
                new VaultManager(tempDir.resolve("vault.dat"), tempDir.resolve("vault.local.key")),
                IpcEventSink.NOOP
        );
    }
}
