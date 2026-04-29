package com.termira.ssh;

public record SshConnectRequest(
        String profileId,
        String sessionId,
        String host,
        Integer port,
        String username,
        String authType,
        String password,
        String privateKeyPath,
        String privateKeyContent,
        String passphrase,
        Integer connectTimeoutMs
) {
}
