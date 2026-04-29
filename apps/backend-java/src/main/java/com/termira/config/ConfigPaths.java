package com.termira.config;

import java.nio.file.Path;
import java.util.Locale;

public final class ConfigPaths {
    private ConfigPaths() {
    }

    public static Path resolve() {
        String property = System.getProperty("termira.config.dir");
        if (hasText(property)) {
            return Path.of(property);
        }

        String env = System.getenv("TERMIRA_CONFIG_DIR");
        if (hasText(env)) {
            return Path.of(env);
        }

        String userHome = System.getProperty("user.home");
        String osName = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (osName.contains("mac")) {
            return Path.of(userHome, "Library", "Application Support", "Termira");
        }
        if (osName.contains("win")) {
            String appData = System.getenv("APPDATA");
            if (hasText(appData)) {
                return Path.of(appData, "Termira");
            }
            return Path.of(userHome, "AppData", "Roaming", "Termira");
        }

        String xdgConfigHome = System.getenv("XDG_CONFIG_HOME");
        if (hasText(xdgConfigHome)) {
            return Path.of(xdgConfigHome, "termira");
        }
        return Path.of(userHome, ".config", "termira");
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
