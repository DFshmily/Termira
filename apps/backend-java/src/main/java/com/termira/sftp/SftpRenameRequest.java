package com.termira.sftp;

public record SftpRenameRequest(
        String sessionId,
        String sourcePath,
        String targetPath
) {
}
