package com.termira.ssh;

import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import net.schmizz.sshj.SSHClient;

final class SshSessionHandle {
    private final SshConnectionSpec spec;
    private final SSHClient client;
    private final Map<String, TerminalChannel> channels = new ConcurrentHashMap<>();
    private volatile SshStatus status;
    private volatile String errorCode;
    private volatile String errorMessage;

    SshSessionHandle(SshConnectionSpec spec, SSHClient client, SshStatus status) {
        this.spec = spec;
        this.client = client;
        this.status = status;
    }

    SshConnectionSpec spec() {
        return spec;
    }

    SSHClient client() {
        return client;
    }

    SshStatus status() {
        return status;
    }

    void status(SshStatus status) {
        this.status = status;
    }

    String errorCode() {
        return errorCode;
    }

    String errorMessage() {
        return errorMessage;
    }

    void clearError() {
        errorCode = null;
        errorMessage = null;
    }

    void fail(String code, String message) {
        status = SshStatus.FAILED;
        errorCode = code;
        errorMessage = message;
    }

    void putChannel(TerminalChannel channel) {
        channels.put(channel.channelId(), channel);
    }

    TerminalChannel channel(String channelId) {
        return channels.get(channelId);
    }

    TerminalChannel removeChannel(String channelId) {
        return channels.remove(channelId);
    }

    Collection<TerminalChannel> channels() {
        return channels.values();
    }

    SshSessionView view() {
        return new SshSessionView(
                spec.sessionId(),
                spec.profileId(),
                spec.host(),
                spec.port(),
                spec.username(),
                status,
                errorCode,
                errorMessage
        );
    }
}
