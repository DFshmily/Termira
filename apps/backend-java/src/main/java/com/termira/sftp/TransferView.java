package com.termira.sftp;

public record TransferView(
        String transferId,
        String sessionId,
        String direction,
        String localPath,
        String remotePath,
        String fileName,
        String status,
        long bytesTransferred,
        long totalBytes,
        int percent,
        String errorCode,
        String errorMessage,
        String createdAt,
        String updatedAt
) {
}
