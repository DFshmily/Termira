package com.termira.profile;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ForwardRule(
        String id,
        String profileId,
        String name,
        String type,
        String bindHost,
        int bindPort,
        String targetHost,
        Integer targetPort,
        String createdAt,
        String updatedAt
) {
}
