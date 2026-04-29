package com.termira.vault;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record CredentialRecord(
        String credentialId,
        String type,
        String password,
        String passphrase,
        String privateKeyContent,
        String createdAt,
        String updatedAt
) {
    public CredentialMetadata metadata() {
        return new CredentialMetadata(credentialId, type, createdAt, updatedAt);
    }
}
