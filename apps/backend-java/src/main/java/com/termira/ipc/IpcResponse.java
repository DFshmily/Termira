package com.termira.ipc;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.termira.error.AppError;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record IpcResponse(
        String id,
        String type,
        boolean ok,
        Object result,
        ErrorBody error
) {
    public static IpcResponse success(String id, Object result) {
        return new IpcResponse(id, "response", true, result, null);
    }

    public static IpcResponse failure(String id, AppError error) {
        return new IpcResponse(
                id,
                "response",
                false,
                null,
                new ErrorBody(error.code(), error.getMessage(), error.detail())
        );
    }

    public record ErrorBody(
            String code,
            String message,
            Map<String, Object> detail
    ) {
    }
}
