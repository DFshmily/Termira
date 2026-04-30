package com.termira.monitor;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record MonitorCpu(
        double usagePercent,
        long totalTicks,
        long idleTicks
) {
}
