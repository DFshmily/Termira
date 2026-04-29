package com.termira.profile;

public record ForwardRuleInput(
        String id,
        String profileId,
        String name,
        String type,
        String bindHost,
        Integer bindPort,
        String targetHost,
        Integer targetPort
) {
}
