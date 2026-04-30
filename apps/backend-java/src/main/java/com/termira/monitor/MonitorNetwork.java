package com.termira.monitor;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record MonitorNetwork(
        long rxBytes,
        long txBytes,
        double rxRateBytesPerSecond,
        double txRateBytesPerSecond
) {
}
