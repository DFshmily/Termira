package com.termira.sftp;

import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import com.termira.ipc.IpcEvent;
import com.termira.ipc.IpcEventSink;
import com.termira.ssh.SshSessionManager;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;
import net.schmizz.sshj.common.StreamCopier;
import net.schmizz.sshj.sftp.FileAttributes;
import net.schmizz.sshj.sftp.FileMode;
import net.schmizz.sshj.sftp.RemoteResourceInfo;
import net.schmizz.sshj.sftp.Response;
import net.schmizz.sshj.sftp.SFTPClient;
import net.schmizz.sshj.sftp.SFTPException;
import net.schmizz.sshj.xfer.TransferListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class SftpManager implements AutoCloseable {
    private static final Logger LOGGER = LoggerFactory.getLogger(SftpManager.class);
    private static final long PROGRESS_INTERVAL_MS = 200;

    private final SshSessionManager sshSessionManager;
    private final ExecutorService transferExecutor = Executors.newSingleThreadExecutor(daemonThreadFactory());
    private final Map<String, TransferTask> transfers = new ConcurrentHashMap<>();
    private volatile IpcEventSink eventSink;

    public SftpManager(SshSessionManager sshSessionManager, IpcEventSink eventSink) {
        this.sshSessionManager = sshSessionManager;
        this.eventSink = eventSink == null ? IpcEventSink.NOOP : eventSink;
    }

    public void setEventSink(IpcEventSink eventSink) {
        this.eventSink = eventSink == null ? IpcEventSink.NOOP : eventSink;
    }

    public SftpOpenResult open(SftpOpenRequest request) throws AppError {
        String sessionId = requireText(request == null ? null : request.sessionId(), "sessionId");
        String path = optionalPath(request.path(), ".");
        try (SFTPClient client = sshSessionManager.openSftpClient(sessionId)) {
            return new SftpOpenResult(sessionId, canonicalize(client, path), client.version());
        } catch (AppError error) {
            throw error;
        } catch (IOException error) {
            throw mapSftpError(error, "open", path);
        }
    }

    public SftpListResult list(SftpListRequest request) throws AppError {
        String sessionId = requireText(request == null ? null : request.sessionId(), "sessionId");
        String path = optionalPath(request.path(), ".");
        try (SFTPClient client = sshSessionManager.openSftpClient(sessionId)) {
            String canonicalPath = canonicalize(client, path);
            List<SftpFileEntry> entries = client.ls(canonicalPath).stream()
                    .filter(resource -> !".".equals(resource.getName()) && !"..".equals(resource.getName()))
                    .map(this::toEntry)
                    .sorted(Comparator.comparing(SftpFileEntry::directory).reversed()
                            .thenComparing(entry -> entry.name().toLowerCase()))
                    .toList();
            SftpListResult result = new SftpListResult(sessionId, canonicalPath, parentPath(canonicalPath), entries);
            eventSink.emit(IpcEvent.create("sftp.listUpdated", result));
            return result;
        } catch (AppError error) {
            throw error;
        } catch (IOException error) {
            throw mapSftpError(error, "list", path);
        }
    }

    public TransferView upload(SftpUploadRequest request) throws AppError {
        String sessionId = requireText(request == null ? null : request.sessionId(), "sessionId");
        String localPathText = requireText(request.localPath(), "localPath");
        String remotePath = requireText(request.remotePath(), "remotePath");
        Path localPath = expandLocalPath(localPathText);
        if (!Files.isRegularFile(localPath)) {
            throw new AppError(ErrorCode.SFTP_PATH_NOT_FOUND, "Local file not found.", detail("path", localPath.toString()));
        }

        long totalBytes;
        try {
            totalBytes = Files.size(localPath);
        } catch (IOException error) {
            throw new AppError(ErrorCode.SFTP_OPERATION_FAILED, "Failed to read local file.", detail("path", localPath.toString()));
        }

        TransferTask task = new TransferTask(
                prefixedId("transfer"),
                sessionId,
                "upload",
                localPath.toString(),
                remotePath,
                fileName(localPath.toString(), remotePath),
                totalBytes
        );
        submitTransfer(task);
        return task.view();
    }

    public TransferView download(SftpDownloadRequest request) throws AppError {
        String sessionId = requireText(request == null ? null : request.sessionId(), "sessionId");
        String remotePath = requireText(request.remotePath(), "remotePath");
        String localPathText = requireText(request.localPath(), "localPath");
        Path localPath = expandLocalPath(localPathText);
        if (Files.isDirectory(localPath)) {
            localPath = localPath.resolve(remoteName(remotePath));
        }
        Path parent = localPath.getParent();
        try {
            if (parent != null) {
                Files.createDirectories(parent);
            }
        } catch (IOException error) {
            throw new AppError(ErrorCode.SFTP_OPERATION_FAILED, "Failed to prepare local download path.", detail("path", localPath.toString()));
        }

        long totalBytes = 0;
        try (SFTPClient client = sshSessionManager.openSftpClient(sessionId)) {
            totalBytes = client.stat(remotePath).getSize();
        } catch (AppError error) {
            throw error;
        } catch (IOException error) {
            throw mapSftpError(error, "download", remotePath);
        }

        TransferTask task = new TransferTask(
                prefixedId("transfer"),
                sessionId,
                "download",
                localPath.toString(),
                remotePath,
                remoteName(remotePath),
                totalBytes
        );
        submitTransfer(task);
        return task.view();
    }

    public Map<String, Object> remove(SftpRemoveRequest request) throws AppError {
        String sessionId = requireText(request == null ? null : request.sessionId(), "sessionId");
        String path = requireText(request.path(), "path");
        try (SFTPClient client = sshSessionManager.openSftpClient(sessionId)) {
            boolean directory = Boolean.TRUE.equals(request.directory());
            if (!directory) {
                FileAttributes attributes = client.lstat(path);
                directory = attributes.getType() == FileMode.Type.DIRECTORY;
            }
            if (directory) {
                client.rmdir(path);
            } else {
                client.rm(path);
            }
            return Map.of("sessionId", sessionId, "path", path, "removed", true, "directory", directory);
        } catch (AppError error) {
            throw error;
        } catch (IOException error) {
            throw mapSftpError(error, "remove", path);
        }
    }

    public Map<String, Object> rename(SftpRenameRequest request) throws AppError {
        String sessionId = requireText(request == null ? null : request.sessionId(), "sessionId");
        String sourcePath = requireText(request.sourcePath(), "sourcePath");
        String targetPath = requireText(request.targetPath(), "targetPath");
        try (SFTPClient client = sshSessionManager.openSftpClient(sessionId)) {
            client.rename(sourcePath, targetPath);
            return Map.of("sessionId", sessionId, "sourcePath", sourcePath, "targetPath", targetPath, "renamed", true);
        } catch (AppError error) {
            throw error;
        } catch (IOException error) {
            throw mapSftpError(error, "rename", sourcePath);
        }
    }

    public Map<String, Object> mkdir(SftpMkdirRequest request) throws AppError {
        String sessionId = requireText(request == null ? null : request.sessionId(), "sessionId");
        String path = requireText(request.path(), "path");
        try (SFTPClient client = sshSessionManager.openSftpClient(sessionId)) {
            client.mkdir(path);
            return Map.of("sessionId", sessionId, "path", path, "created", true);
        } catch (AppError error) {
            throw error;
        } catch (IOException error) {
            throw mapSftpError(error, "mkdir", path);
        }
    }

    public TransferView cancelTransfer(SftpCancelTransferRequest request) throws AppError {
        String transferId = requireText(request == null ? null : request.transferId(), "transferId");
        TransferTask task = transfers.get(transferId);
        if (task == null) {
            throw new AppError(ErrorCode.SFTP_TRANSFER_NOT_FOUND, "SFTP transfer not found.", detail("transferId", transferId));
        }
        task.cancel();
        return task.view();
    }

    public void closeSession(String sessionId) {
        if (!hasText(sessionId)) {
            return;
        }
        for (TransferTask task : new ArrayList<>(transfers.values())) {
            if (sessionId.equals(task.sessionId)) {
                task.cancel();
            }
        }
    }

    @Override
    public void close() {
        for (TransferTask task : new ArrayList<>(transfers.values())) {
            task.cancel();
        }
        transferExecutor.shutdownNow();
    }

    private void submitTransfer(TransferTask task) {
        transfers.put(task.transferId, task);
        Future<?> future = transferExecutor.submit(task);
        task.future = future;
    }

    private SftpFileEntry toEntry(RemoteResourceInfo resource) {
        FileAttributes attributes = resource.getAttributes();
        FileMode.Type type = attributes.getType();
        boolean directory = type == FileMode.Type.DIRECTORY || resource.isDirectory();
        boolean regularFile = type == FileMode.Type.REGULAR || resource.isRegularFile();
        boolean symlink = type == FileMode.Type.SYMLINK;
        long modifiedTime = attributes.getMtime();
        return new SftpFileEntry(
                resource.getName(),
                resource.getPath(),
                resource.getParent(),
                type == null ? "UNKNOWN" : type.name(),
                attributes.getSize(),
                permissions(attributes.getMode()),
                modifiedTime > 0 ? Instant.ofEpochSecond(modifiedTime).toString() : null,
                modifiedTime,
                directory,
                regularFile,
                symlink
        );
    }

    private String canonicalize(SFTPClient client, String path) throws IOException {
        String normalized = optionalPath(path, ".");
        if ("~".equals(normalized)) {
            return client.canonicalize(".");
        }
        if (normalized.startsWith("~/")) {
            return joinRemotePath(client.canonicalize("."), normalized.substring(2));
        }
        return client.canonicalize(normalized);
    }

    private AppError mapSftpError(IOException error, String action, String path) {
        SFTPException sftpError = findSftpError(error);
        if (sftpError != null) {
            Response.StatusCode statusCode = sftpError.getStatusCode();
            if (statusCode == Response.StatusCode.PERMISSION_DENIED || statusCode == Response.StatusCode.WRITE_PROTECT) {
                return new AppError(ErrorCode.SFTP_PERMISSION_DENIED, "SFTP permission denied.", detail("action", action, "path", path));
            }
            if (statusCode == Response.StatusCode.NO_SUCH_FILE || statusCode == Response.StatusCode.NO_SUCH_PATH) {
                return new AppError(ErrorCode.SFTP_PATH_NOT_FOUND, "SFTP path not found.", detail("action", action, "path", path));
            }
            if (statusCode == Response.StatusCode.NO_CONNECTION || statusCode == Response.StatusCode.CONNECITON_LOST) {
                return new AppError(ErrorCode.SFTP_NOT_CONNECTED, "SFTP connection is not available.", detail("action", action));
            }
        }
        return new AppError(
                ErrorCode.SFTP_OPERATION_FAILED,
                "SFTP operation failed.",
                detail("action", action, "path", path, "cause", error.getClass().getSimpleName())
        );
    }

    private AppError mapTransferError(Exception error, TransferTask task) {
        if (task.cancelled.get()) {
            return new AppError(ErrorCode.SFTP_TRANSFER_CANCELLED, "SFTP transfer cancelled.", detail("transferId", task.transferId));
        }
        if (error instanceof AppError appError) {
            return appError;
        }
        if (error instanceof IOException ioError) {
            AppError mapped = mapSftpError(ioError, task.direction, task.remotePath);
            if (!ErrorCode.SFTP_OPERATION_FAILED.equals(mapped.code())) {
                return mapped;
            }
        }
        return new AppError(
                ErrorCode.SFTP_TRANSFER_FAILED,
                "SFTP transfer failed.",
                detail("transferId", task.transferId, "cause", error.getClass().getSimpleName())
        );
    }

    private SFTPException findSftpError(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof SFTPException sftpError) {
                return sftpError;
            }
            current = current.getCause();
        }
        return null;
    }

    private String permissions(FileMode mode) {
        if (mode == null) {
            return "----";
        }
        return String.format("%04o", mode.getPermissionsMask());
    }

    static String parentPath(String path) {
        if (!hasText(path) || "/".equals(path)) {
            return "/";
        }
        int index = path.lastIndexOf('/');
        if (index <= 0) {
            return "/";
        }
        return path.substring(0, index);
    }

    private Path expandLocalPath(String value) {
        String trimmed = value.trim();
        if ("~".equals(trimmed)) {
            return Path.of(System.getProperty("user.home"));
        }
        if (trimmed.startsWith("~/")) {
            return Path.of(System.getProperty("user.home"), trimmed.substring(2));
        }
        return Path.of(trimmed);
    }

    private String fileName(String localPath, String remotePath) {
        String localName = Path.of(localPath).getFileName() == null ? "" : Path.of(localPath).getFileName().toString();
        return hasText(localName) ? localName : remoteName(remotePath);
    }

    private String remoteName(String remotePath) {
        String normalized = remotePath.endsWith("/") && remotePath.length() > 1
                ? remotePath.substring(0, remotePath.length() - 1)
                : remotePath;
        int index = normalized.lastIndexOf('/');
        return index >= 0 ? normalized.substring(index + 1) : normalized;
    }

    private String optionalPath(String path, String fallback) {
        return hasText(path) ? path.trim() : fallback;
    }

    private String joinRemotePath(String basePath, String name) {
        String trimmedName = name.trim();
        if ("/".equals(basePath)) {
            return "/" + trimmedName;
        }
        return basePath.replaceAll("/+$", "") + "/" + trimmedName;
    }

    private String requireText(String value, String field) throws AppError {
        if (!hasText(value)) {
            throw new AppError(ErrorCode.SFTP_VALIDATION_FAILED, "Missing required SFTP field: " + field, detail("field", field));
        }
        return value.trim();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private String prefixedId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "");
    }

    private Map<String, Object> detail(Object... values) {
        Map<String, Object> detail = new LinkedHashMap<>();
        for (int index = 0; index + 1 < values.length; index += 2) {
            Object value = values[index + 1];
            if (value != null) {
                detail.put(String.valueOf(values[index]), value);
            }
        }
        return detail;
    }

    private static ThreadFactory daemonThreadFactory() {
        return runnable -> {
            Thread thread = new Thread(runnable, "termira-sftp-transfer");
            thread.setDaemon(true);
            return thread;
        };
    }

    private final class TransferTask implements Runnable {
        private final String transferId;
        private final String sessionId;
        private final String direction;
        private final String localPath;
        private final String remotePath;
        private final String fileName;
        private final String createdAt;
        private final AtomicBoolean cancelled = new AtomicBoolean(false);
        private final AtomicBoolean terminalEventEmitted = new AtomicBoolean(false);
        private volatile Future<?> future;
        private volatile String status = "queued";
        private volatile long bytesTransferred;
        private volatile long totalBytes;
        private volatile String errorCode;
        private volatile String errorMessage;
        private volatile String updatedAt;
        private volatile long lastProgressEventAt;

        private TransferTask(
                String transferId,
                String sessionId,
                String direction,
                String localPath,
                String remotePath,
                String fileName,
                long totalBytes
        ) {
            this.transferId = transferId;
            this.sessionId = sessionId;
            this.direction = direction;
            this.localPath = localPath;
            this.remotePath = remotePath;
            this.fileName = fileName;
            this.totalBytes = Math.max(0, totalBytes);
            this.createdAt = Instant.now().toString();
            this.updatedAt = createdAt;
        }

        @Override
        public void run() {
            if (cancelled.get()) {
                fail(new AppError(ErrorCode.SFTP_TRANSFER_CANCELLED, "SFTP transfer cancelled.", detail("transferId", transferId)));
                return;
            }

            status = "running";
            touch();
            emitProgress(true);
            try (SFTPClient client = sshSessionManager.openSftpClient(sessionId)) {
                client.getFileTransfer().setTransferListener(new ProgressTransferListener(this));
                if ("upload".equals(direction)) {
                    client.getFileTransfer().upload(localPath, remotePath);
                } else {
                    client.getFileTransfer().download(remotePath, localPath);
                }
                if (cancelled.get()) {
                    fail(new AppError(ErrorCode.SFTP_TRANSFER_CANCELLED, "SFTP transfer cancelled.", detail("transferId", transferId)));
                    return;
                }
                complete();
            } catch (Exception error) {
                fail(mapTransferError(error, this));
            }
        }

        private void cancel() {
            cancelled.set(true);
            Future<?> currentFuture = future;
            if ("queued".equals(status) && currentFuture != null && currentFuture.cancel(false)) {
                fail(new AppError(ErrorCode.SFTP_TRANSFER_CANCELLED, "SFTP transfer cancelled.", detail("transferId", transferId)));
            }
        }

        private void updateProgress(long transferred, long size) throws IOException {
            if (cancelled.get()) {
                throw new IOException("SFTP transfer cancelled.");
            }
            totalBytes = Math.max(totalBytes, size);
            bytesTransferred = Math.max(0, transferred);
            touch();
            emitProgress(false);
        }

        private void emitProgress(boolean force) {
            long now = System.currentTimeMillis();
            if (!force && now - lastProgressEventAt < PROGRESS_INTERVAL_MS && bytesTransferred < totalBytes) {
                return;
            }
            lastProgressEventAt = now;
            eventSink.emit(IpcEvent.create("transfer.progress", view()));
        }

        private void complete() {
            if (terminalEventEmitted.compareAndSet(false, true)) {
                status = "completed";
                bytesTransferred = Math.max(bytesTransferred, totalBytes);
                touch();
                eventSink.emit(IpcEvent.create("transfer.completed", view()));
                LOGGER.info("sftp.transfer transferId={} direction={} status=completed", transferId, direction);
            }
        }

        private void fail(AppError error) {
            if (terminalEventEmitted.compareAndSet(false, true)) {
                status = ErrorCode.SFTP_TRANSFER_CANCELLED.equals(error.code()) ? "cancelled" : "failed";
                errorCode = error.code();
                errorMessage = error.getMessage();
                touch();
                eventSink.emit(IpcEvent.create("transfer.failed", view()));
                if (!ErrorCode.SFTP_TRANSFER_CANCELLED.equals(error.code())) {
                    LOGGER.warn("sftp.transfer transferId={} direction={} status=failed code={}", transferId, direction, error.code());
                }
            }
        }

        private TransferView view() {
            long total = Math.max(0, totalBytes);
            long transferred = Math.max(0, bytesTransferred);
            int percent = total == 0 ? ("completed".equals(status) ? 100 : 0) : (int) Math.min(100, (transferred * 100) / total);
            return new TransferView(
                    transferId,
                    sessionId,
                    direction,
                    localPath,
                    remotePath,
                    fileName,
                    status,
                    transferred,
                    total,
                    percent,
                    errorCode,
                    errorMessage,
                    createdAt,
                    updatedAt
            );
        }

        private void touch() {
            updatedAt = Instant.now().toString();
        }
    }

    private static final class ProgressTransferListener implements TransferListener {
        private final TransferTask task;

        private ProgressTransferListener(TransferTask task) {
            this.task = task;
        }

        @Override
        public TransferListener directory(String name) {
            return this;
        }

        @Override
        public StreamCopier.Listener file(String name, long size) {
            task.totalBytes = Math.max(task.totalBytes, size);
            return transferred -> task.updateProgress(transferred, size);
        }
    }
}
