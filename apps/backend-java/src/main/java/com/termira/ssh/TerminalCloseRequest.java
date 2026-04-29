package com.termira.ssh;

public record TerminalCloseRequest(
        String sessionId,
        String channelId
) {
}
