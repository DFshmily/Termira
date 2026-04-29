package com.termira.vault;

public record VaultInitRequest(
        String mode,
        String masterPassword
) {
}
