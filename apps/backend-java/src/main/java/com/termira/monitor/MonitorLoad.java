package com.termira.monitor;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record MonitorLoad(
        double oneMinute,
        double fiveMinutes,
        double fifteenMinutes
) {
}
