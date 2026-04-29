package com.termira.ipc;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record IpcEvent(
        String type,
        String event,
        String eventId,
        String timestamp,
        Object payload
) {
    public static IpcEvent create(String event, Object payload) {
        return new IpcEvent(
                "event",
                event,
                "evt_" + UUID.randomUUID(),
                Instant.now().toString(),
                payload
        );
    }
}
