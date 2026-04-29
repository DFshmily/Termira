package com.termira.vault;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record VaultStatus(
        boolean initialized,
        boolean locked,
        String mode,
        int schemaVersion,
        int credentialCount,
        String kdfName,
        String cipherName,
        String vaultPath
) {
}
