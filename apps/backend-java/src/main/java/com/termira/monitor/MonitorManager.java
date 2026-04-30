package com.termira.monitor;

import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import com.termira.ipc.IpcEvent;
import com.termira.ipc.IpcEventSink;
import com.termira.ssh.RemoteCommandResult;
import com.termira.ssh.SshSessionManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class MonitorManager implements AutoCloseable {
    private static final Logger LOGGER = LoggerFactory.getLogger(MonitorManager.class);
    private static final int DEFAULT_INTERVAL_MS = 3_000;
    private static final int COMMAND_TIMEOUT_MS = 2_000;
    private static final String LINUX_MONITOR_COMMAND = String.join("; ",
            "export LC_ALL=C",
            "cat /proc/stat",
            "echo __TERMIRA_MEM__",
            "cat /proc/meminfo",
            "echo __TERMIRA_DF__",
            "df -P -k /",
            "echo __TERMIRA_NET__",
            "cat /proc/net/dev",
            "echo __TERMIRA_UPTIME__",
            "cat /proc/uptime",
            "echo __TERMIRA_LOAD__",
            "cat /proc/loadavg"
    );

    private final SshSessionManager sshSessionManager;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1, daemonThreadFactory());
    private final Map<String, ScheduledFuture<?>> activeMonitors = new ConcurrentHashMap<>();
    private final Map<String, MonitorRawCounters> lastCounters = new ConcurrentHashMap<>();
    private volatile IpcEventSink eventSink;

    public MonitorManager(SshSessionManager sshSessionManager, IpcEventSink eventSink) {
        this.sshSessionManager = sshSessionManager;
        this.eventSink = eventSink == null ? IpcEventSink.NOOP : eventSink;
    }

    public void setEventSink(IpcEventSink eventSink) {
        this.eventSink = eventSink == null ? IpcEventSink.NOOP : eventSink;
    }

    public MonitorSnapshot start(MonitorRequest request) throws AppError {
        String sessionId = requireSessionId(request);
        int intervalMs = normalizeInterval(request == null ? null : request.intervalMs());
        MonitorSnapshot firstSnapshot = snapshot(new MonitorRequest(sessionId, intervalMs));
        ScheduledFuture<?> previous = activeMonitors.remove(sessionId);
        if (previous != null) {
            previous.cancel(false);
        }
        ScheduledFuture<?> future = scheduler.scheduleWithFixedDelay(
                () -> collectAndEmitQuietly(sessionId),
                intervalMs,
                intervalMs,
                TimeUnit.MILLISECONDS
        );
        activeMonitors.put(sessionId, future);
        return firstSnapshot;
    }

    public Map<String, Object> stop(MonitorRequest request) throws AppError {
        String sessionId = requireSessionId(request);
        stopSession(sessionId);
        return Map.of("sessionId", sessionId, "stopped", true);
    }

    public MonitorSnapshot snapshot(MonitorRequest request) throws AppError {
        String sessionId = requireSessionId(request);
        MonitorSnapshot snapshot = collect(sessionId);
        eventSink.emit(IpcEvent.create("monitor.snapshot", snapshot));
        return snapshot;
    }

    public void closeSession(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }
        stopSession(sessionId);
    }

    @Override
    public void close() {
        for (String sessionId : new ArrayList<>(activeMonitors.keySet())) {
            stopSession(sessionId);
        }
        scheduler.shutdownNow();
    }

    private MonitorSnapshot collect(String sessionId) throws AppError {
        RemoteCommandResult result = sshSessionManager.exec(
                sessionId,
                LINUX_MONITOR_COMMAND,
                COMMAND_TIMEOUT_MS,
                ErrorCode.MONITOR_NOT_CONNECTED,
                ErrorCode.MONITOR_OPERATION_FAILED
        );
        MonitorParseResult parsed = LinuxMonitorParser.parse(sessionId, result, lastCounters.get(sessionId));
        if (parsed.counters() != null) {
            lastCounters.put(sessionId, parsed.counters());
        }
        return parsed.snapshot();
    }

    private void collectAndEmitQuietly(String sessionId) {
        try {
            eventSink.emit(IpcEvent.create("monitor.snapshot", collect(sessionId)));
        } catch (AppError error) {
            eventSink.emit(IpcEvent.create("monitor.snapshot", MonitorSnapshot.unavailable(
                    sessionId,
                    Instant.now().toString(),
                    error.code(),
                    error.getMessage()
            )));
            LOGGER.debug("monitor.snapshot failed sessionId={} code={}", sessionId, error.code());
        }
    }

    private void stopSession(String sessionId) {
        ScheduledFuture<?> future = activeMonitors.remove(sessionId);
        if (future != null) {
            future.cancel(false);
        }
        lastCounters.remove(sessionId);
    }

    private String requireSessionId(MonitorRequest request) throws AppError {
        String sessionId = request == null ? null : request.sessionId();
        if (sessionId == null || sessionId.isBlank()) {
            throw new AppError(ErrorCode.MONITOR_VALIDATION_FAILED, "Missing monitor sessionId.", Map.of("field", "sessionId"));
        }
        return sessionId.trim();
    }

    private int normalizeInterval(Integer intervalMs) {
        if (intervalMs == null) {
            return DEFAULT_INTERVAL_MS;
        }
        return Math.max(1_000, Math.min(60_000, intervalMs));
    }

    private static ThreadFactory daemonThreadFactory() {
        return runnable -> {
            Thread thread = new Thread(runnable, "termira-monitor");
            thread.setDaemon(true);
            return thread;
        };
    }
}
