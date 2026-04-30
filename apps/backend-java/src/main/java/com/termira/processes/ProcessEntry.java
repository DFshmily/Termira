package com.termira.processes;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProcessEntry(
        long pid,
        long ppid,
        String user,
        double cpuPercent,
        double memoryPercent,
        String state,
        String name,
        String command
) {
}
