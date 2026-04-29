package com.termira.vault;

public record CredentialMetadata(
        String credentialId,
        String type,
        String createdAt,
        String updatedAt
) {
}
