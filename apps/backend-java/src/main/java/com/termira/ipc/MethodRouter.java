package com.termira.ipc;

import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

public final class MethodRouter {
    public static final String PROTOCOL_VERSION = "1.0.0";
    public static final String BACKEND_VERSION = "0.1.0";

    private final AtomicBoolean shutdownRequested = new AtomicBoolean(false);

    public Object route(IpcRequest request) throws AppError {
        return switch (request.method()) {
            case "app.ping" -> ping();
            case "app.getVersion" -> version();
            case "app.getBackendStatus" -> backendStatus();
            case "app.shutdown" -> shutdown();
            default -> throw new AppError(
                    ErrorCode.IPC_UNKNOWN_METHOD,
                    "Unknown IPC method: " + request.method(),
                    Map.of("method", request.method())
            );
        };
    }

    public boolean isShutdownRequested() {
        return shutdownRequested.get();
    }

    private Map<String, Object> ping() {
        return Map.of(
                "message", "pong",
                "timestamp", Instant.now().toString(),
                "protocolVersion", PROTOCOL_VERSION,
                "backendVersion", BACKEND_VERSION
        );
    }

    private Map<String, Object> version() {
        return Map.of(
                "protocolVersion", PROTOCOL_VERSION,
                "backendVersion", BACKEND_VERSION
        );
    }

    private Map<String, Object> backendStatus() {
        return Map.of(
                "state", "online",
                "protocolVersion", PROTOCOL_VERSION,
                "backendVersion", BACKEND_VERSION
        );
    }

    private Map<String, Object> shutdown() {
        shutdownRequested.set(true);
        return Map.of("accepted", true);
    }
}
