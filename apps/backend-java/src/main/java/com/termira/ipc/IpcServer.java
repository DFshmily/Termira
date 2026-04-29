package com.termira.ipc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class IpcServer {
    private static final Logger LOGGER = LoggerFactory.getLogger(IpcServer.class);

    private final BufferedReader reader;
    private final PrintWriter writer;
    private final MethodRouter router;
    private final ObjectMapper mapper;

    public IpcServer(InputStream input, OutputStream output, MethodRouter router) {
        this.reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
        this.writer = new PrintWriter(new OutputStreamWriter(output, StandardCharsets.UTF_8), true);
        this.router = router;
        this.mapper = new ObjectMapper().registerModule(new JavaTimeModule());
    }

    public int run() throws IOException {
        String line;
        while (!router.isShutdownRequested() && (line = reader.readLine()) != null) {
            if (line.isBlank()) {
                continue;
            }
            handleLine(line);
        }

        return 0;
    }

    public void emit(IpcEvent event) throws IOException {
        writeJson(event);
    }

    private void handleLine(String line) throws IOException {
        IpcRequest request;
        try {
            request = mapper.readValue(line, IpcRequest.class);
        } catch (IOException error) {
            LOGGER.warn("Invalid IPC JSON received: {}", error.getMessage());
            emit(IpcEvent.create("backend.error", Map.of(
                    "code", ErrorCode.IPC_INVALID_REQUEST,
                    "message", "Invalid IPC JSON"
            )));
            return;
        }

        try {
            validateRequest(request);
            Object result = router.route(request);
            writeJson(IpcResponse.success(request.id(), result));
        } catch (AppError error) {
            LOGGER.warn("IPC request failed method={} code={}", request.method(), error.code());
            writeJson(IpcResponse.failure(request.id() == null ? "unknown" : request.id(), error));
        }
    }

    private void validateRequest(IpcRequest request) throws AppError {
        if (!"request".equals(request.type()) || isBlank(request.id()) || isBlank(request.method())) {
            throw new AppError(
                    ErrorCode.IPC_INVALID_REQUEST,
                    "IPC request must include type=request, id, and method."
            );
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private void writeJson(Object message) throws IOException {
        synchronized (writer) {
            writer.println(mapper.writeValueAsString(message));
            writer.flush();
        }
    }
}
