package com.termira.monitor;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record MonitorMemory(
        long totalBytes,
        long usedBytes,
        long availableBytes,
        double usagePercent
) {
}
