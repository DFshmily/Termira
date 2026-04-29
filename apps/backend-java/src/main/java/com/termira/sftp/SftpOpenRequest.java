package com.termira.sftp;

public record SftpOpenRequest(
        String sessionId,
        String path
) {
}
