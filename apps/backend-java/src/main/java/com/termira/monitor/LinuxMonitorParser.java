package com.termira.monitor;

import com.termira.error.ErrorCode;
import com.termira.ssh.RemoteCommandResult;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

final class LinuxMonitorParser {
    private static final String MEM_MARKER = "__TERMIRA_MEM__";
    private static final String DF_MARKER = "__TERMIRA_DF__";
    private static final String NET_MARKER = "__TERMIRA_NET__";
    private static final String UPTIME_MARKER = "__TERMIRA_UPTIME__";
    private static final String LOAD_MARKER = "__TERMIRA_LOAD__";

    private LinuxMonitorParser() {
    }

    static MonitorParseResult parse(String sessionId, RemoteCommandResult result, MonitorRawCounters previous) {
        if (result.exitStatus() != 0) {
            return MonitorParseResult.unavailable(
                    sessionId,
                    result.completedAt(),
                    "Remote monitor command exited with status " + result.exitStatus() + errorSuffix(result.stderr())
            );
        }

        try {
            Sections sections = splitSections(result.stdout());
            CpuStats cpuStats = parseCpu(sections.cpuLines());
            MonitorMemory memory = parseMemory(sections.memLines());
            MonitorDisk disk = parseDisk(sections.dfLines());
            NetworkStats networkStats = parseNetwork(sections.netLines());
            Long uptimeSeconds = parseUptime(sections.uptimeLines());
            MonitorLoad load = parseLoad(sections.loadLines());
            Instant collected = Instant.parse(result.completedAt());
            MonitorRawCounters counters = new MonitorRawCounters(
                    cpuStats.totalTicks(),
                    cpuStats.idleTicks(),
                    networkStats.rxBytes(),
                    networkStats.txBytes(),
                    collected
            );

            MonitorCpu cpu = new MonitorCpu(cpuUsage(cpuStats, previous), cpuStats.totalTicks(), cpuStats.idleTicks());
            MonitorNetwork network = networkRates(networkStats, previous, collected);
            MonitorSnapshot snapshot = new MonitorSnapshot(
                    sessionId,
                    true,
                    result.completedAt(),
                    null,
                    null,
                    cpu,
                    memory,
                    disk,
                    network,
                    load,
                    uptimeSeconds
            );
            return new MonitorParseResult(snapshot, counters);
        } catch (Exception error) {
            return MonitorParseResult.unavailable(
                    sessionId,
                    result.completedAt(),
                    "Unable to parse Linux monitor output: " + error.getMessage()
            );
        }
    }

    private static Sections splitSections(String stdout) {
        Sections sections = new Sections();
        List<String> target = sections.cpuLines();
        for (String rawLine : stdout.split("\\R")) {
            String line = rawLine.strip();
            if (MEM_MARKER.equals(line)) {
                target = sections.memLines();
                continue;
            }
            if (DF_MARKER.equals(line)) {
                target = sections.dfLines();
                continue;
            }
            if (NET_MARKER.equals(line)) {
                target = sections.netLines();
                continue;
            }
            if (UPTIME_MARKER.equals(line)) {
                target = sections.uptimeLines();
                continue;
            }
            if (LOAD_MARKER.equals(line)) {
                target = sections.loadLines();
                continue;
            }
            if (!line.isEmpty()) {
                target.add(line);
            }
        }
        return sections;
    }

    private static CpuStats parseCpu(List<String> lines) {
        String cpuLine = lines.stream()
                .filter(line -> line.startsWith("cpu "))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("missing /proc/stat cpu line"));
        String[] parts = cpuLine.split("\\s+");
        long total = 0;
        for (int index = 1; index < parts.length; index++) {
            total += parseLong(parts[index], "cpu tick");
        }
        long idle = parseLong(parts[4], "cpu idle");
        if (parts.length > 5) {
            idle += parseLong(parts[5], "cpu iowait");
        }
        return new CpuStats(total, idle);
    }

    private static MonitorMemory parseMemory(List<String> lines) {
        Map<String, Long> mem = new HashMap<>();
        for (String line : lines) {
            String[] parts = line.split("\\s+");
            if (parts.length >= 2 && parts[0].endsWith(":")) {
                mem.put(parts[0].substring(0, parts[0].length() - 1), parseLong(parts[1], parts[0]) * 1024L);
            }
        }
        long total = requirePositive(mem.get("MemTotal"), "MemTotal");
        long available = mem.getOrDefault(
                "MemAvailable",
                mem.getOrDefault("MemFree", 0L) + mem.getOrDefault("Buffers", 0L) + mem.getOrDefault("Cached", 0L)
        );
        long used = Math.max(0, total - available);
        return new MonitorMemory(total, used, Math.max(0, available), percent(used, total));
    }

    private static MonitorDisk parseDisk(List<String> lines) {
        String dataLine = lines.stream()
                .filter(line -> !line.toLowerCase(Locale.ROOT).startsWith("filesystem"))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("missing df data"));
        String[] parts = dataLine.split("\\s+");
        if (parts.length < 6) {
            throw new IllegalArgumentException("invalid df data");
        }
        long total = parseLong(parts[1], "df total") * 1024L;
        long used = parseLong(parts[2], "df used") * 1024L;
        long available = parseLong(parts[3], "df available") * 1024L;
        String mount = parts[parts.length - 1];
        return new MonitorDisk(mount, total, used, available, percent(used, total));
    }

    private static NetworkStats parseNetwork(List<String> lines) {
        long rx = 0;
        long tx = 0;
        long loopbackRx = 0;
        long loopbackTx = 0;
        for (String line : lines) {
            int colonIndex = line.indexOf(':');
            if (colonIndex < 0) {
                continue;
            }
            String iface = line.substring(0, colonIndex).trim();
            String[] parts = line.substring(colonIndex + 1).trim().split("\\s+");
            if (parts.length < 16) {
                continue;
            }
            long currentRx = parseLong(parts[0], "network rx");
            long currentTx = parseLong(parts[8], "network tx");
            if ("lo".equals(iface)) {
                loopbackRx += currentRx;
                loopbackTx += currentTx;
            } else {
                rx += currentRx;
                tx += currentTx;
            }
        }
        if (rx == 0 && tx == 0) {
            rx = loopbackRx;
            tx = loopbackTx;
        }
        return new NetworkStats(rx, tx);
    }

    private static Long parseUptime(List<String> lines) {
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("missing uptime");
        }
        return Math.max(0L, Math.round(Double.parseDouble(lines.get(0).split("\\s+")[0])));
    }

    private static MonitorLoad parseLoad(List<String> lines) {
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("missing loadavg");
        }
        String[] parts = lines.get(0).split("\\s+");
        if (parts.length < 3) {
            throw new IllegalArgumentException("invalid loadavg");
        }
        return new MonitorLoad(roundTwo(Double.parseDouble(parts[0])), roundTwo(Double.parseDouble(parts[1])), roundTwo(Double.parseDouble(parts[2])));
    }

    private static double cpuUsage(CpuStats current, MonitorRawCounters previous) {
        if (previous != null) {
            long totalDelta = current.totalTicks() - previous.cpuTotalTicks();
            long idleDelta = current.idleTicks() - previous.cpuIdleTicks();
            if (totalDelta > 0 && idleDelta >= 0) {
                return percent(totalDelta - idleDelta, totalDelta);
            }
        }
        return percent(current.totalTicks() - current.idleTicks(), current.totalTicks());
    }

    private static MonitorNetwork networkRates(NetworkStats current, MonitorRawCounters previous, Instant collected) {
        double rxRate = 0;
        double txRate = 0;
        if (previous != null) {
            double seconds = Math.max(0.001, Duration.between(previous.collectedAt(), collected).toMillis() / 1000.0);
            if (current.rxBytes() >= previous.netRxBytes()) {
                rxRate = (current.rxBytes() - previous.netRxBytes()) / seconds;
            }
            if (current.txBytes() >= previous.netTxBytes()) {
                txRate = (current.txBytes() - previous.netTxBytes()) / seconds;
            }
        }
        return new MonitorNetwork(current.rxBytes(), current.txBytes(), roundTwo(rxRate), roundTwo(txRate));
    }

    private static long parseLong(String value, String field) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException("invalid " + field);
        }
    }

    private static long requirePositive(Long value, String field) {
        if (value == null || value <= 0) {
            throw new IllegalArgumentException("missing " + field);
        }
        return value;
    }

    private static double percent(double numerator, double denominator) {
        if (denominator <= 0) {
            return 0;
        }
        return roundTwo(Math.max(0, Math.min(100, numerator * 100.0 / denominator)));
    }

    private static double roundTwo(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static String errorSuffix(String stderr) {
        if (stderr == null || stderr.isBlank()) {
            return "";
        }
        return ": " + stderr.strip();
    }

    private record Sections(
            List<String> cpuLines,
            List<String> memLines,
            List<String> dfLines,
            List<String> netLines,
            List<String> uptimeLines,
            List<String> loadLines
    ) {
        Sections() {
            this(new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>());
        }
    }

    private record CpuStats(long totalTicks, long idleTicks) {
    }

    private record NetworkStats(long rxBytes, long txBytes) {
    }
}

record MonitorRawCounters(
        long cpuTotalTicks,
        long cpuIdleTicks,
        long netRxBytes,
        long netTxBytes,
        Instant collectedAt
) {
}

record MonitorParseResult(
        MonitorSnapshot snapshot,
        MonitorRawCounters counters
) {
    static MonitorParseResult unavailable(String sessionId, String collectedAt, String errorMessage) {
        return new MonitorParseResult(
                MonitorSnapshot.unavailable(sessionId, collectedAt, ErrorCode.MONITOR_OPERATION_FAILED, errorMessage),
                null
        );
    }
}
