package com.termira.processes;

import java.util.List;

public record ProcessListResult(
        String sessionId,
        String collectedAt,
        List<ProcessEntry> processes
) {
}
