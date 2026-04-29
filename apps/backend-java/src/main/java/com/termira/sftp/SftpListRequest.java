package com.termira.sftp;

public record SftpListRequest(
        String sessionId,
        String path
) {
}
