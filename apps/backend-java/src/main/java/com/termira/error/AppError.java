package com.termira.error;

import java.util.Map;

public final class AppError extends Exception {
    private final String code;
    private final Map<String, Object> detail;

    public AppError(String code, String message) {
        this(code, message, Map.of());
    }

    public AppError(String code, String message, Map<String, Object> detail) {
        super(message);
        this.code = code;
        this.detail = Map.copyOf(detail);
    }

    public String code() {
        return code;
    }

    public Map<String, Object> detail() {
        return detail;
    }
}
