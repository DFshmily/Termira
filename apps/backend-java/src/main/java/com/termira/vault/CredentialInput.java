package com.termira.vault;

public record CredentialInput(
        String credentialId,
        String type,
        String password,
        String passphrase,
        String privateKeyContent
) {
}
