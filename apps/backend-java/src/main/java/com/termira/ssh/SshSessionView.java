package com.termira.ssh;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SshSessionView(
        String sessionId,
        String profileId,
        String host,
        int port,
        String username,
        SshStatus status,
        String errorCode,
        String errorMessage
) {
}
