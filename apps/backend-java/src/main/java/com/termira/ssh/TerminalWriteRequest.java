package com.termira.ssh;

public record TerminalWriteRequest(
        String sessionId,
        String channelId,
        String data
) {
}
