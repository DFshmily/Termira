package com.termira.ssh;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record RemoteCommandResult(
        String sessionId,
        int exitStatus,
        String stdout,
        String stderr,
        String startedAt,
        String completedAt
) {
}
