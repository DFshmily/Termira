package com.termira.sftp;

public record SftpDownloadRequest(
        String sessionId,
        String remotePath,
        String localPath
) {
}
