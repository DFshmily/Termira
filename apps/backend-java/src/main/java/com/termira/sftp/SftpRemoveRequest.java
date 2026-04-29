package com.termira.sftp;

public record SftpRemoveRequest(
        String sessionId,
        String path,
        Boolean directory
) {
}
