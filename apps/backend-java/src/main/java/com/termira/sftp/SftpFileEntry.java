package com.termira.sftp;

public record SftpFileEntry(
        String name,
        String path,
        String parentPath,
        String type,
        long size,
        String permissions,
        String modifiedAt,
        long modifiedTime,
        boolean directory,
        boolean regularFile,
        boolean symlink
) {
}
