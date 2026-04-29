package com.termira.ssh;

record SshConnectionSpec(
        String sessionId,
        String profileId,
        String host,
        int port,
        String username,
        String authType,
        String password,
        String privateKeyPath,
        String privateKeyContent,
        String passphrase,
        int connectTimeoutMs
) {
}
