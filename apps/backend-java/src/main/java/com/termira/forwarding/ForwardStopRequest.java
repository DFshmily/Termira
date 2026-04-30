package com.termira.forwarding;

import com.fasterxml.jackson.annotation.JsonAlias;

public record ForwardStopRequest(
        @JsonAlias("forwardingId") String id
) {
}
