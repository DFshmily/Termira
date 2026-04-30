package com.termira.forwarding;

import com.fasterxml.jackson.annotation.JsonAlias;

public record ForwardStartRequest(
        @JsonAlias("forwardingId") String id,
        String sessionId
) {
}
