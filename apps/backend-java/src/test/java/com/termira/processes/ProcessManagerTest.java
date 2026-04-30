package com.termira.processes;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class ProcessManagerTest {
    @Test
    void parsesProcessRowsWithCommandArguments() {
        String stdout = """
                  42     1 root      12.5  1.2 S    java            /usr/bin/java -jar app.jar --spring.profiles.active=prod
                1050    42 ubuntu     0.1  0.4 Ss   bash            -bash
                """;

        List<ProcessEntry> entries = ProcessManager.parseProcesses(stdout);

        assertThat(entries).hasSize(2);
        assertThat(entries.get(0).pid()).isEqualTo(42);
        assertThat(entries.get(0).cpuPercent()).isEqualTo(12.5);
        assertThat(entries.get(0).command()).contains("--spring.profiles.active=prod");
        assertThat(entries.get(1).user()).isEqualTo("ubuntu");
    }
}
