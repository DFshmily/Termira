package com.termira;

import com.termira.ipc.IpcEvent;
import com.termira.ipc.IpcServer;
import com.termira.ipc.MethodRouter;
import com.termira.config.ConfigPaths;
import com.termira.logging.LogPaths;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Main {
    private Main() {
    }

    public static void main(String[] args) throws IOException {
        Path logDir = LogPaths.resolve();
        Files.createDirectories(logDir);
        System.setProperty("termira.log.dir", logDir.toString());

        Logger logger = LoggerFactory.getLogger(Main.class);
        logger.info("Termira Java sidecar starting logDir={}", logDir);

        Path configDir = ConfigPaths.resolve();
        Files.createDirectories(configDir);
        logger.info("Termira Java sidecar configDir={}", configDir);

        MethodRouter router = new MethodRouter(configDir);
        IpcServer server = new IpcServer(System.in, System.out, router);
        server.emit(IpcEvent.create("backend.ready", Map.of(
                "protocolVersion", MethodRouter.PROTOCOL_VERSION,
                "backendVersion", MethodRouter.BACKEND_VERSION,
                "pid", ProcessHandle.current().pid(),
                "configDir", configDir.toString()
        )));

        int exitCode = server.run();
        logger.info("Termira Java sidecar stopped code={}", exitCode);
    }
}
