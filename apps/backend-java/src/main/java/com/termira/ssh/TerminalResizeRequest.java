package com.termira.ssh;

public record TerminalResizeRequest(
        String sessionId,
        String channelId,
        Integer cols,
        Integer rows,
        Integer width,
        Integer height
) {
}
