package com.termira.ipc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import com.termira.forwarding.ForwardRuleView;
import com.termira.profile.AuthConfig;
import com.termira.profile.HostProfile;
import com.termira.profile.HostProfileInput;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class MethodRouterTest {
    private final ObjectMapper mapper = new ObjectMapper();

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

    @Test
    void routesForwardCrudMethods() throws Exception {
        MethodRouter router = new MethodRouter(tempDir);
        HostProfile profile = (HostProfile) router.route(new IpcRequest("req_profile", "request", "profile.create", json(Map.of(
                "name", "Forward host",
                "host", "127.0.0.1",
                "port", 22,
                "username", "ubuntu",
                "tags", List.of(),
                "auth", new AuthConfig("password", null, null, false),
                "favorite", false
        ))));

        Object created = router.route(new IpcRequest("req_forward_create", "request", "forward.create", json(Map.of(
                "profileId", profile.id(),
                "name", "Local admin",
                "type", "local",
                "bindHost", "127.0.0.1",
                "bindPort", 18080,
                "targetHost", "127.0.0.1",
                "targetPort", 8080,
                "autoStart", true
        ))));

        assertThat(created).isInstanceOf(ForwardRuleView.class);
        ForwardRuleView rule = (ForwardRuleView) created;
        assertThat(rule.status().value()).isEqualTo("stopped");
        assertThat(rule.autoStart()).isTrue();

        Object listed = router.route(new IpcRequest("req_forward_list", "request", "forward.list", json(Map.of("profileId", profile.id()))));
        assertThat(listed).asList().extracting("id").containsExactly(rule.id());

        ForwardRuleView updated = (ForwardRuleView) router.route(new IpcRequest("req_forward_update", "request", "forward.update", json(Map.of(
                "id", rule.id(),
                "rule", Map.of(
                        "profileId", profile.id(),
                        "name", "Local app",
                        "type", "local",
                        "bindHost", "127.0.0.1",
                        "bindPort", 18081,
                        "targetHost", "127.0.0.1",
                        "targetPort", 8081
                )
        ))));
        assertThat(updated.name()).isEqualTo("Local app");

        Object deleted = router.route(new IpcRequest("req_forward_delete", "request", "forward.delete", json(Map.of("id", rule.id()))));
        assertThat(((Map<?, ?>) deleted).get("deleted")).isEqualTo(true);
    }

    private JsonNode json(Object value) {
        return mapper.valueToTree(value);
    }
}
