package com.termira.logging;

import java.nio.file.Path;

public final class LogPaths {
    private LogPaths() {
    }

    public static Path resolve() {
        String property = System.getProperty("termira.log.dir");
        if (hasText(property)) {
            return Path.of(property);
        }

        String env = System.getenv("TERMIRA_LOG_DIR");
        if (hasText(env)) {
            return Path.of(env);
        }

        return Path.of(System.getProperty("user.home"), ".termira", "logs");
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
