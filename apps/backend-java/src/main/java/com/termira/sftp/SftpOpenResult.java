package com.termira.sftp;

public record SftpOpenResult(
        String sessionId,
        String path,
        int version
) {
}
