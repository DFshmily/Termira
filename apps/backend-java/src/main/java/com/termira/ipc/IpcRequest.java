package com.termira.ipc;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;

@JsonIgnoreProperties(ignoreUnknown = true)
public record IpcRequest(
        String id,
        String type,
        String method,
        JsonNode params
) {
}
