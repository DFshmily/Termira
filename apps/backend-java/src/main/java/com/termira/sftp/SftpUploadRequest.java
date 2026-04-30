package com.termira.sftp;

public record SftpUploadRequest(
        String sessionId,
        String localPath,
        String remotePath
) {
}
