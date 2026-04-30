package com.termira.forwarding;

import com.fasterxml.jackson.annotation.JsonValue;

public enum ForwardStatus {
    STARTING("starting"),
    RUNNING("running"),
    STOPPING("stopping"),
    STOPPED("stopped"),
    FAILED("failed");

    private final String value;

    ForwardStatus(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }
}
