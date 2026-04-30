package com.termira.sftp;

import java.util.List;

public record SftpListResult(
        String sessionId,
        String path,
        String parentPath,
        List<SftpFileEntry> entries
) {
}
