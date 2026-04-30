package com.termira.monitor;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record MonitorDisk(
        String path,
        long totalBytes,
        long usedBytes,
        long availableBytes,
        double usagePercent
) {
}
