package com.termira.ssh;

import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import com.termira.ipc.IpcEvent;
import com.termira.ipc.IpcEventSink;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import net.schmizz.sshj.connection.channel.direct.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

final class TerminalChannel implements AutoCloseable {
    private static final Logger LOGGER = LoggerFactory.getLogger(TerminalChannel.class);

    private final String sessionId;
    private final String channelId;
    private final Session session;
    private final Session.Shell shell;
    private final OutputStream input;
    private final IpcEventSink eventSink;
    private final AtomicBoolean closed = new AtomicBoolean(false);

    TerminalChannel(
            String sessionId,
            String channelId,
            Session session,
            Session.Shell shell,
            IpcEventSink eventSink,
            ExecutorService executor
    ) {
        this.sessionId = sessionId;
        this.channelId = channelId;
        this.session = session;
        this.shell = shell;
        this.input = shell.getOutputStream();
        this.eventSink = eventSink;
        executor.submit(() -> pump(shell.getInputStream(), "stdout"));
        executor.submit(() -> pump(shell.getErrorStream(), "stderr"));
    }

    String channelId() {
        return channelId;
    }

    void write(String data) throws AppError {
        if (closed.get()) {
            throw new AppError(ErrorCode.SSH_TERMINAL_NOT_FOUND, "Terminal channel is closed.", Map.of("channelId", channelId));
        }
        try {
            input.write(data.getBytes(StandardCharsets.UTF_8));
            input.flush();
        } catch (IOException error) {
            throw new AppError(
                    ErrorCode.SSH_CHANNEL_WRITE_FAILED,
                    "Failed to write terminal input.",
                    Map.of("sessionId", sessionId, "channelId", channelId)
            );
        }
    }

    void resize(int cols, int rows, int width, int height) throws AppError {
        if (closed.get()) {
            throw new AppError(ErrorCode.SSH_TERMINAL_NOT_FOUND, "Terminal channel is closed.", Map.of("channelId", channelId));
        }
        try {
            shell.changeWindowDimensions(cols, rows, width, height);
        } catch (IOException error) {
            throw new AppError(
                    ErrorCode.SSH_CHANNEL_WRITE_FAILED,
                    "Failed to resize terminal.",
                    Map.of("sessionId", sessionId, "channelId", channelId)
            );
        }
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        try {
            shell.close();
        } catch (IOException error) {
            LOGGER.debug("Shell close failed sessionId={} channelId={}", sessionId, channelId, error);
        }
        try {
            session.close();
        } catch (IOException error) {
            LOGGER.debug("Session close failed sessionId={} channelId={}", sessionId, channelId, error);
        }
        emitClosed();
    }

    private void pump(InputStream stream, String streamName) {
        byte[] buffer = new byte[8192];
        try {
            int read;
            while (!closed.get() && (read = stream.read(buffer)) != -1) {
                if (read == 0) {
                    continue;
                }
                String data = new String(buffer, 0, read, StandardCharsets.UTF_8);
                eventSink.emit(IpcEvent.create("terminal.output", Map.of(
                        "sessionId", sessionId,
                        "channelId", channelId,
                        "stream", streamName,
                        "data", data
                )));
            }
        } catch (IOException error) {
            if (!closed.get()) {
                LOGGER.debug("Terminal stream ended with error sessionId={} channelId={}", sessionId, channelId, error);
            }
        } finally {
            if (!closed.get()) {
                close();
            }
        }
    }

    private void emitClosed() {
        eventSink.emit(IpcEvent.create("terminal.closed", Map.of(
                "sessionId", sessionId,
                "channelId", channelId
        )));
    }
}
