package com.termira.profile;

public record ForwardRuleInput(
        String id,
        String profileId,
        String name,
        String type,
        String bindHost,
        Integer bindPort,
        String targetHost,
        Integer targetPort,
        Boolean autoStart
) {
    public ForwardRuleInput(
            String id,
            String profileId,
            String name,
            String type,
            String bindHost,
            Integer bindPort,
            String targetHost,
            Integer targetPort
    ) {
        this(id, profileId, name, type, bindHost, bindPort, targetHost, targetPort, false);
    }
}
