package com.termira.monitor;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record MonitorSnapshot(
        String sessionId,
        boolean available,
        String collectedAt,
        String errorCode,
        String errorMessage,
        MonitorCpu cpu,
        MonitorMemory memory,
        MonitorDisk disk,
        MonitorNetwork network,
        MonitorLoad load,
        Long uptimeSeconds
) {
    public static MonitorSnapshot unavailable(String sessionId, String collectedAt, String errorCode, String errorMessage) {
        return new MonitorSnapshot(
                sessionId,
                false,
                collectedAt,
                errorCode,
                errorMessage,
                null,
                null,
                null,
                null,
                null,
                null
        );
    }
}
