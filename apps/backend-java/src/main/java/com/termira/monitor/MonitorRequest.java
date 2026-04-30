package com.termira.monitor;

public record MonitorRequest(
        String sessionId,
        Integer intervalMs
) {
}
