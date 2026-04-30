package com.termira.ipc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class MethodRouterTest {
    @TempDir
    Path tempDir;

    @Test
    void routesPing() throws AppError {
        MethodRouter router = new MethodRouter(tempDir);

        Object result = router.route(new IpcRequest("req_1", "request", "app.ping", null));

        assertThat(result).isInstanceOf(Map.class);
        assertThat(((Map<?, ?>) result).get("message")).isEqualTo("pong");
    }

    @Test
    void routesVersion() throws AppError {
        MethodRouter router = new MethodRouter(tempDir);

        Object result = router.route(new IpcRequest("req_1", "request", "app.getVersion", null));

        assertThat(result).isInstanceOf(Map.class);
        assertThat(((Map<?, ?>) result).get("protocolVersion")).isEqualTo(MethodRouter.PROTOCOL_VERSION);
    }

    @Test
    void rejectsUnknownMethod() {
        MethodRouter router = new MethodRouter(tempDir);

        assertThatThrownBy(() -> router.route(new IpcRequest("req_1", "request", "missing.method", null)))
                .isInstanceOf(AppError.class)
                .hasMessageContaining("Unknown IPC method");
    }

    @Test
    void rejectsInvalidSshConnectParamsBeforeNetwork() {
        MethodRouter router = new MethodRouter(tempDir);

        assertThatThrownBy(() -> router.route(new IpcRequest("req_1", "request", "ssh.connect", null)))
                .isInstanceOfSatisfying(AppError.class, error ->
                        assertThat(error.code()).isEqualTo(ErrorCode.SSH_VALIDATION_FAILED));
    }

    @Test
    void returnsMissingSessionForTerminalWriteWithoutSession() {
        MethodRouter router = new MethodRouter(tempDir);

        assertThatThrownBy(() -> router.route(new IpcRequest("req_1", "request", "terminal.write", null)))
                .isInstanceOfSatisfying(AppError.class, error ->
                        assertThat(error.code()).isEqualTo(ErrorCode.SSH_VALIDATION_FAILED));
    }

    @Test
    void returnsSftpValidationForListWithoutSession() {
        MethodRouter router = new MethodRouter(tempDir);

        assertThatThrownBy(() -> router.route(new IpcRequest("req_1", "request", "sftp.list", null)))
                .isInstanceOfSatisfying(AppError.class, error ->
                        assertThat(error.code()).isEqualTo(ErrorCode.SFTP_VALIDATION_FAILED));
    }
}
