package com.termira.profile;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuthConfig(
        String type,
        String credentialRef,
        String privateKeyPath,
        boolean saveCredential
) {
    public AuthConfig normalized() {
        String normalizedType = hasText(type) ? type : "password";
        return new AuthConfig(
                normalizedType,
                blankToNull(credentialRef),
                blankToNull(privateKeyPath),
                saveCredential
        );
    }

    private static String blankToNull(String value) {
        return hasText(value) ? value : null;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
