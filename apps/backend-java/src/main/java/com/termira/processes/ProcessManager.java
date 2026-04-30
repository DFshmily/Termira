package com.termira.processes;

import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import com.termira.ipc.IpcEvent;
import com.termira.ipc.IpcEventSink;
import com.termira.ssh.RemoteCommandResult;
import com.termira.ssh.SshSessionManager;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class ProcessManager {
    private static final int COMMAND_TIMEOUT_MS = 2_000;
    private static final Set<String> ALLOWED_SIGNALS = Set.of("TERM", "KILL", "INT", "HUP");
    private static final String LIST_COMMAND = "export LC_ALL=C; ps -eo pid=,ppid=,user=,pcpu=,pmem=,stat=,comm=,args= --sort=-pcpu | head -n 250";

    private final SshSessionManager sshSessionManager;
    private volatile IpcEventSink eventSink;

    public ProcessManager(SshSessionManager sshSessionManager, IpcEventSink eventSink) {
        this.sshSessionManager = sshSessionManager;
        this.eventSink = eventSink == null ? IpcEventSink.NOOP : eventSink;
    }

    public void setEventSink(IpcEventSink eventSink) {
        this.eventSink = eventSink == null ? IpcEventSink.NOOP : eventSink;
    }

    public ProcessListResult list(ProcessListRequest request) throws AppError {
        String sessionId = requireSessionId(request == null ? null : request.sessionId());
        RemoteCommandResult result = sshSessionManager.exec(
                sessionId,
                LIST_COMMAND,
                COMMAND_TIMEOUT_MS,
                ErrorCode.PROCESS_NOT_CONNECTED,
                ErrorCode.PROCESS_OPERATION_FAILED
        );
        if (result.exitStatus() != 0) {
            throw operationError("Remote process list command failed.", result);
        }
        ProcessListResult list = new ProcessListResult(sessionId, result.completedAt(), parseProcesses(result.stdout()));
        eventSink.emit(IpcEvent.create("process.listUpdated", list));
        return list;
    }

    public Map<String, Object> kill(ProcessKillRequest request) throws AppError {
        String sessionId = requireSessionId(request == null ? null : request.sessionId());
        long pid = requirePid(request == null ? null : request.pid());
        String signal = normalizeSignal(request == null ? null : request.signal());
        RemoteCommandResult result = sshSessionManager.exec(
                sessionId,
                "kill -" + signal + " -- " + pid,
                COMMAND_TIMEOUT_MS,
                ErrorCode.PROCESS_NOT_CONNECTED,
                ErrorCode.PROCESS_OPERATION_FAILED
        );
        if (result.exitStatus() != 0) {
            throw operationError("Failed to kill remote process.", result);
        }
        return Map.of("sessionId", sessionId, "pid", pid, "signal", signal, "killed", true);
    }

    static List<ProcessEntry> parseProcesses(String stdout) {
        List<ProcessEntry> processes = new ArrayList<>();
        for (String rawLine : stdout.split("\\R")) {
            String line = rawLine.strip();
            if (line.isEmpty()) {
                continue;
            }
            String[] parts = line.split("\\s+", 8);
            if (parts.length < 8) {
                continue;
            }
            try {
                processes.add(new ProcessEntry(
                        Long.parseLong(parts[0]),
                        Long.parseLong(parts[1]),
                        parts[2],
                        roundTwo(Double.parseDouble(parts[3])),
                        roundTwo(Double.parseDouble(parts[4])),
                        parts[5],
                        parts[6],
                        parts[7]
                ));
            } catch (NumberFormatException ignored) {
                // Ignore individual malformed rows from platform-specific ps output.
            }
        }
        return processes;
    }

    private AppError operationError(String message, RemoteCommandResult result) {
        return new AppError(
                ErrorCode.PROCESS_OPERATION_FAILED,
                message,
                Map.of(
                        "sessionId", result.sessionId(),
                        "exitStatus", result.exitStatus(),
                        "stderr", result.stderr() == null ? "" : result.stderr().strip()
                )
        );
    }

    private String requireSessionId(String sessionId) throws AppError {
        if (sessionId == null || sessionId.isBlank()) {
            throw new AppError(ErrorCode.PROCESS_VALIDATION_FAILED, "Missing process sessionId.", Map.of("field", "sessionId"));
        }
        return sessionId.trim();
    }

    private long requirePid(Long pid) throws AppError {
        if (pid == null || pid <= 1) {
            throw new AppError(ErrorCode.PROCESS_VALIDATION_FAILED, "Invalid process pid.", Map.of("field", "pid"));
        }
        return pid;
    }

    private String normalizeSignal(String signal) throws AppError {
        String value = signal == null || signal.isBlank() ? "TERM" : signal.trim().toUpperCase(Locale.ROOT);
        if (value.startsWith("SIG")) {
            value = value.substring(3);
        }
        if (!ALLOWED_SIGNALS.contains(value)) {
            throw new AppError(ErrorCode.PROCESS_VALIDATION_FAILED, "Unsupported process signal.", Map.of("field", "signal"));
        }
        return value;
    }

    private static double roundTwo(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
