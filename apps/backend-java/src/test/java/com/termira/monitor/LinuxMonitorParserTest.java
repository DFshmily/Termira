package com.termira.monitor;

import static org.assertj.core.api.Assertions.assertThat;

import com.termira.ssh.RemoteCommandResult;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class LinuxMonitorParserTest {
    @Test
    void parsesLinuxProcOutputAndComputesRatesFromPreviousCounters() {
        String collectedAt = Instant.parse("2026-04-30T09:00:03Z").toString();
        String stdout = """
                cpu  120 0 80 800 0 0 0 0 0 0
                cpu0 120 0 80 800 0 0 0 0 0 0
                __TERMIRA_MEM__
                MemTotal:        2048000 kB
                MemFree:          256000 kB
                MemAvailable:    1024000 kB
                Buffers:           10000 kB
                Cached:           120000 kB
                __TERMIRA_DF__
                Filesystem     1024-blocks    Used Available Capacity Mounted on
                /dev/vda1         10240000 5120000   5120000      50% /
                __TERMIRA_NET__
                Inter-|   Receive                                                |  Transmit
                 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
                  lo: 10 0 0 0 0 0 0 0 20 0 0 0 0 0 0 0
                eth0: 4000 0 0 0 0 0 0 0 8000 0 0 0 0 0 0 0
                __TERMIRA_UPTIME__
                12345.67 111.00
                __TERMIRA_LOAD__
                0.12 0.34 0.56 1/100 1234
                """;

        MonitorParseResult parsed = LinuxMonitorParser.parse(
                "ssh_1",
                new RemoteCommandResult("ssh_1", 0, stdout, "", collectedAt, collectedAt),
                new MonitorRawCounters(900, 750, 1000, 2000, Instant.parse("2026-04-30T09:00:00Z"))
        );

        assertThat(parsed.snapshot().available()).isTrue();
        assertThat(parsed.snapshot().cpu().usagePercent()).isEqualTo(50.0);
        assertThat(parsed.snapshot().memory().usagePercent()).isEqualTo(50.0);
        assertThat(parsed.snapshot().disk().usagePercent()).isEqualTo(50.0);
        assertThat(parsed.snapshot().network().rxRateBytesPerSecond()).isEqualTo(1000.0);
        assertThat(parsed.snapshot().network().txRateBytesPerSecond()).isEqualTo(2000.0);
        assertThat(parsed.snapshot().uptimeSeconds()).isEqualTo(12346L);
        assertThat(parsed.counters()).isNotNull();
    }

    @Test
    void returnsUnavailableSnapshotForCommandFailure() {
        String now = Instant.parse("2026-04-30T09:00:00Z").toString();

        MonitorParseResult parsed = LinuxMonitorParser.parse(
                "ssh_1",
                new RemoteCommandResult("ssh_1", 127, "", "cat: /proc/stat: No such file", now, now),
                null
        );

        assertThat(parsed.snapshot().available()).isFalse();
        assertThat(parsed.snapshot().errorMessage()).contains("status 127");
    }
}
