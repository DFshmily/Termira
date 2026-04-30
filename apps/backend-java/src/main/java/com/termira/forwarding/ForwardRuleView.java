package com.termira.forwarding;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ForwardRuleView(
        String id,
        String forwardingId,
        String profileId,
        String name,
        String type,
        String bindHost,
        int bindPort,
        String targetHost,
        Integer targetPort,
        boolean autoStart,
        ForwardStatus status,
        String sessionId,
        String errorCode,
        String errorMessage,
        String createdAt,
        String updatedAt,
        String statusChangedAt
) {
}
