package com.termira.ssh;

public record TerminalOpenShellRequest(
        String sessionId,
        String channelId,
        Integer cols,
        Integer rows,
        String term
) {
}
