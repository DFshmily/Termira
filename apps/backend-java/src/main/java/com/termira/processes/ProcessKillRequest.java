package com.termira.processes;

public record ProcessKillRequest(
        String sessionId,
        Long pid,
        String signal
) {
}
