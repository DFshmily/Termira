package com.termira.sftp;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SftpManagerTest {
    @Test
    void resolvesRootParentForTopLevelDirectory() {
        assertThat(SftpManager.parentPath("/home")).isEqualTo("/");
        assertThat(SftpManager.parentPath("/")).isEqualTo("/");
        assertThat(SftpManager.parentPath("/home/ubuntu")).isEqualTo("/home");
    }
}
