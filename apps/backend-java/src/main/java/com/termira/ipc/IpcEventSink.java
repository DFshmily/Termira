package com.termira.ipc;

@FunctionalInterface
public interface IpcEventSink {
    IpcEventSink NOOP = event -> {
    };

    void emit(IpcEvent event);
}
