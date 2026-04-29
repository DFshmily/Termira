package com.termira.ipc;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class IpcServerTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeAll
    static void setLogDirectory() throws IOException {
        Path logDir = Path.of(System.getProperty("java.io.tmpdir"), "termira-test-logs");
        Files.createDirectories(logDir);
        System.setProperty("termira.log.dir", logDir.toString());
    }

    @Test
    void handlesLineDelimitedRequests() throws Exception {
        String input = """
                {"id":"req_1","type":"request","method":"app.ping","params":{}}
                {"id":"req_2","type":"request","method":"app.shutdown","params":{}}
                """;
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        IpcServer server = new IpcServer(
                new ByteArrayInputStream(input.getBytes(StandardCharsets.UTF_8)),
                output,
                new MethodRouter()
        );

        int code = server.run();
        String[] lines = output.toString(StandardCharsets.UTF_8).strip().split("\\R");

        JsonNode ping = mapper.readTree(lines[0]);
        JsonNode shutdown = mapper.readTree(lines[1]);

        assertThat(code).isZero();
        assertThat(lines).hasSize(2);
        assertThat(ping.get("id").asText()).isEqualTo("req_1");
        assertThat(ping.get("ok").asBoolean()).isTrue();
        assertThat(ping.at("/result/message").asText()).isEqualTo("pong");
        assertThat(shutdown.get("id").asText()).isEqualTo("req_2");
        assertThat(shutdown.at("/result/accepted").asBoolean()).isTrue();
    }
}
