package com.termira.sftp;

public record SftpMkdirRequest(
        String sessionId,
        String path
) {
}
