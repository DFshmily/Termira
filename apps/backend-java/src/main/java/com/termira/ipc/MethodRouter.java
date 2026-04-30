package com.termira.ipc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.termira.config.ConfigPaths;
import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import com.termira.forwarding.ForwardStartRequest;
import com.termira.forwarding.ForwardStopRequest;
import com.termira.forwarding.ForwardingManager;
import com.termira.monitor.MonitorManager;
import com.termira.monitor.MonitorRequest;
import com.termira.processes.ProcessKillRequest;
import com.termira.processes.ProcessListRequest;
import com.termira.processes.ProcessManager;
import com.termira.profile.ForwardRuleInput;
import com.termira.profile.HostGroupInput;
import com.termira.profile.HostProfileInput;
import com.termira.profile.ProfileStore;
import com.termira.profile.QuickCommandInput;
import com.termira.sftp.SftpCancelTransferRequest;
import com.termira.sftp.SftpDownloadRequest;
import com.termira.sftp.SftpListRequest;
import com.termira.sftp.SftpManager;
import com.termira.sftp.SftpMkdirRequest;
import com.termira.sftp.SftpOpenRequest;
import com.termira.sftp.SftpRemoveRequest;
import com.termira.sftp.SftpRenameRequest;
import com.termira.sftp.SftpUploadRequest;
import com.termira.ssh.SshConnectRequest;
import com.termira.ssh.SshDisconnectRequest;
import com.termira.ssh.SshSessionManager;
import com.termira.ssh.TerminalCloseRequest;
import com.termira.ssh.TerminalOpenShellRequest;
import com.termira.ssh.TerminalResizeRequest;
import com.termira.ssh.TerminalWriteRequest;
import com.termira.vault.CredentialInput;
import com.termira.vault.VaultInitRequest;
import com.termira.vault.VaultManager;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

public final class MethodRouter {
    public static final String PROTOCOL_VERSION = "1.0.0";
    public static final String BACKEND_VERSION = "0.1.0";

    private final AtomicBoolean shutdownRequested = new AtomicBoolean(false);
    private final ObjectMapper mapper = new ObjectMapper();
    private final ProfileStore profileStore;
    private final VaultManager vaultManager;
    private final SshSessionManager sshSessionManager;
    private final SftpManager sftpManager;
    private final ForwardingManager forwardingManager;
    private final MonitorManager monitorManager;
    private final ProcessManager processManager;

    public MethodRouter() {
        this(ConfigPaths.resolve());
    }

    public MethodRouter(java.nio.file.Path configDir) {
        this(
                new ProfileStore(configDir.resolve("profiles.db")),
                new VaultManager(configDir.resolve("vault.dat"), configDir.resolve("vault.local.key"))
        );
    }

    public MethodRouter(ProfileStore profileStore, VaultManager vaultManager) {
        this.profileStore = profileStore;
        this.vaultManager = vaultManager;
        this.sshSessionManager = new SshSessionManager(profileStore, vaultManager, IpcEventSink.NOOP);
        this.sftpManager = new SftpManager(sshSessionManager, IpcEventSink.NOOP);
        this.forwardingManager = new ForwardingManager(profileStore, sshSessionManager, IpcEventSink.NOOP);
        this.monitorManager = new MonitorManager(sshSessionManager, IpcEventSink.NOOP);
        this.processManager = new ProcessManager(sshSessionManager, IpcEventSink.NOOP);
    }

    public void setEventSink(IpcEventSink eventSink) {
        sshSessionManager.setEventSink(eventSink);
        sftpManager.setEventSink(eventSink);
        forwardingManager.setEventSink(eventSink);
        monitorManager.setEventSink(eventSink);
        processManager.setEventSink(eventSink);
    }

    public Object route(IpcRequest request) throws AppError {
        return switch (request.method()) {
            case "app.ping" -> ping();
            case "app.getVersion" -> version();
            case "app.getBackendStatus" -> backendStatus();
            case "app.shutdown" -> shutdown();
            case "profile.list" -> profileStore.listProfiles();
            case "profile.get" -> profileStore.getProfile(requiredString(request.params(), "id"));
            case "profile.create" -> profileStore.createProfile(params(request, HostProfileInput.class));
            case "profile.update" -> profileStore.updateProfile(requiredString(request.params(), "id"), profileInputForUpdate(request.params()));
            case "profile.delete" -> Map.of("deleted", profileStore.deleteProfile(requiredString(request.params(), "id")));
            case "profile.search" -> profileStore.searchProfiles(optionalString(request.params(), "query"));
            case "profile.markFavorite" -> profileStore.markFavorite(
                    requiredString(request.params(), "id"),
                    optionalBoolean(request.params(), "favorite", true)
            );
            case "profile.recordRecent" -> profileStore.recordRecent(requiredString(request.params(), "id"));
            case "hostGroup.list" -> profileStore.listGroups();
            case "hostGroup.create" -> profileStore.createGroup(params(request, HostGroupInput.class));
            case "hostGroup.update" -> profileStore.updateGroup(requiredString(request.params(), "id"), groupInputForUpdate(request.params()));
            case "hostGroup.delete" -> Map.of("deleted", profileStore.deleteGroup(requiredString(request.params(), "id")));
            case "forwardRule.list" -> profileStore.listForwardRules(optionalString(request.params(), "profileId"));
            case "forwardRule.save" -> profileStore.saveForwardRule(params(request, ForwardRuleInput.class));
            case "forwardRule.delete" -> Map.of("deleted", profileStore.deleteForwardRule(requiredString(request.params(), "id")));
            case "forward.list" -> forwardingManager.list(optionalString(request.params(), "profileId"));
            case "forward.create" -> forwardingManager.create(params(request, ForwardRuleInput.class));
            case "forward.update" -> forwardingManager.update(forwardInputForUpdate(request.params()));
            case "forward.delete" -> forwardingManager.delete(requiredString(request.params(), "id"));
            case "forward.start" -> forwardingManager.start(params(request, ForwardStartRequest.class));
            case "forward.stop" -> forwardingManager.stop(params(request, ForwardStopRequest.class));
            case "monitor.start" -> monitorManager.start(params(request, MonitorRequest.class));
            case "monitor.stop" -> monitorManager.stop(params(request, MonitorRequest.class));
            case "monitor.snapshot" -> monitorManager.snapshot(params(request, MonitorRequest.class));
            case "process.list" -> processManager.list(params(request, ProcessListRequest.class));
            case "process.kill" -> processManager.kill(params(request, ProcessKillRequest.class));
            case "command.list" -> profileStore.listQuickCommands(optionalString(request.params(), "profileId"));
            case "command.create" -> profileStore.saveQuickCommand(params(request, QuickCommandInput.class));
            case "command.update" -> profileStore.saveQuickCommand(quickCommandInputForUpdate(request.params()));
            case "command.delete" -> Map.of("deleted", profileStore.deleteQuickCommand(requiredString(request.params(), "id")));
            case "command.sendToTerminal" -> sendQuickCommandToTerminal(request.params());
            case "quickCommand.list" -> profileStore.listQuickCommands(optionalString(request.params(), "profileId"));
            case "quickCommand.save" -> profileStore.saveQuickCommand(params(request, QuickCommandInput.class));
            case "quickCommand.delete" -> Map.of("deleted", profileStore.deleteQuickCommand(requiredString(request.params(), "id")));
            case "vault.status" -> vaultManager.status();
            case "vault.init" -> vaultManager.init(params(request, VaultInitRequest.class));
            case "vault.unlock" -> vaultManager.unlock(optionalString(request.params(), "masterPassword"));
            case "vault.lock" -> vaultManager.lock();
            case "credential.save" -> vaultManager.saveCredential(params(request, CredentialInput.class));
            case "credential.get" -> vaultManager.getCredential(requiredString(request.params(), "credentialId"));
            case "credential.delete" -> Map.of("deleted", vaultManager.deleteCredential(requiredString(request.params(), "credentialId")));
            case "credential.testDecrypt" -> Map.of("ok", vaultManager.testDecrypt(requiredString(request.params(), "credentialId")));
            case "ssh.connect" -> sshSessionManager.connect(params(request, SshConnectRequest.class));
            case "ssh.disconnect" -> {
                SshDisconnectRequest disconnectRequest = params(request, SshDisconnectRequest.class);
                forwardingManager.closeSession(disconnectRequest.sessionId());
                monitorManager.closeSession(disconnectRequest.sessionId());
                sftpManager.closeSession(disconnectRequest.sessionId());
                yield sshSessionManager.disconnect(disconnectRequest);
            }
            case "ssh.getSession" -> sshSessionManager.getSession(requiredString(request.params(), "sessionId"));
            case "terminal.openShell" -> sshSessionManager.openShell(params(request, TerminalOpenShellRequest.class));
            case "terminal.write" -> sshSessionManager.write(params(request, TerminalWriteRequest.class));
            case "terminal.resize" -> sshSessionManager.resize(params(request, TerminalResizeRequest.class));
            case "terminal.close" -> sshSessionManager.closeTerminal(params(request, TerminalCloseRequest.class));
            case "sftp.open" -> sftpManager.open(params(request, SftpOpenRequest.class));
            case "sftp.list" -> sftpManager.list(params(request, SftpListRequest.class));
            case "sftp.upload" -> sftpManager.upload(params(request, SftpUploadRequest.class));
            case "sftp.download" -> sftpManager.download(params(request, SftpDownloadRequest.class));
            case "sftp.remove" -> sftpManager.remove(params(request, SftpRemoveRequest.class));
            case "sftp.rename" -> sftpManager.rename(params(request, SftpRenameRequest.class));
            case "sftp.mkdir" -> sftpManager.mkdir(params(request, SftpMkdirRequest.class));
            case "sftp.cancelTransfer" -> sftpManager.cancelTransfer(params(request, SftpCancelTransferRequest.class));
            default -> throw new AppError(
                    ErrorCode.IPC_UNKNOWN_METHOD,
                    "Unknown IPC method: " + request.method(),
                    Map.of("method", request.method())
            );
        };
    }

    public boolean isShutdownRequested() {
        return shutdownRequested.get();
    }

    private Map<String, Object> ping() {
        return Map.of(
                "message", "pong",
                "timestamp", Instant.now().toString(),
                "protocolVersion", PROTOCOL_VERSION,
                "backendVersion", BACKEND_VERSION
        );
    }

    private Map<String, Object> version() {
        return Map.of(
                "protocolVersion", PROTOCOL_VERSION,
                "backendVersion", BACKEND_VERSION
        );
    }

    private Map<String, Object> backendStatus() throws AppError {
        return Map.of(
                "state", "online",
                "protocolVersion", PROTOCOL_VERSION,
                "backendVersion", BACKEND_VERSION,
                "profileDbPath", profileStore.dbPath().toString(),
                "vault", vaultManager.status()
        );
    }

    private Map<String, Object> shutdown() {
        monitorManager.close();
        forwardingManager.close();
        sftpManager.close();
        sshSessionManager.close();
        shutdownRequested.set(true);
        return Map.of("accepted", true);
    }

    private <T> T params(IpcRequest request, Class<T> type) throws AppError {
        try {
            JsonNode node = request.params();
            if (node == null || node.isNull()) {
                return mapper.convertValue(Map.of(), type);
            }
            return mapper.treeToValue(node, type);
        } catch (Exception error) {
            throw new AppError(
                    ErrorCode.IPC_INVALID_REQUEST,
                    "Invalid params for method: " + request.method(),
                    Map.of("method", request.method())
            );
        }
    }

    private HostProfileInput profileInputForUpdate(JsonNode params) throws AppError {
        JsonNode profileNode = params == null ? null : params.get("profile");
        try {
            if (profileNode != null && !profileNode.isNull()) {
                return mapper.treeToValue(profileNode, HostProfileInput.class);
            }
            return mapper.treeToValue(params, HostProfileInput.class);
        } catch (Exception error) {
            throw new AppError(ErrorCode.IPC_INVALID_REQUEST, "Invalid profile update params.");
        }
    }

    private HostGroupInput groupInputForUpdate(JsonNode params) throws AppError {
        JsonNode groupNode = params == null ? null : params.get("group");
        try {
            if (groupNode != null && !groupNode.isNull()) {
                return mapper.treeToValue(groupNode, HostGroupInput.class);
            }
            return mapper.treeToValue(params, HostGroupInput.class);
        } catch (Exception error) {
            throw new AppError(ErrorCode.IPC_INVALID_REQUEST, "Invalid host group update params.");
        }
    }

    private ForwardRuleInput forwardInputForUpdate(JsonNode params) throws AppError {
        JsonNode ruleNode = params == null ? null : params.get("rule");
        try {
            if (ruleNode != null && !ruleNode.isNull()) {
                ForwardRuleInput input = mapper.treeToValue(ruleNode, ForwardRuleInput.class);
                if (input.id() != null && !input.id().isBlank()) {
                    return input;
                }
                return new ForwardRuleInput(
                        requiredString(params, "id"),
                        input.profileId(),
                        input.name(),
                        input.type(),
                        input.bindHost(),
                        input.bindPort(),
                        input.targetHost(),
                        input.targetPort(),
                        input.autoStart()
                );
            }
            return mapper.treeToValue(params, ForwardRuleInput.class);
        } catch (AppError error) {
            throw error;
        } catch (Exception error) {
            throw new AppError(ErrorCode.IPC_INVALID_REQUEST, "Invalid forward rule update params.");
        }
    }

    private QuickCommandInput quickCommandInputForUpdate(JsonNode params) throws AppError {
        JsonNode commandNode = params == null ? null : params.get("command");
        try {
            if (commandNode != null && commandNode.isObject()) {
                QuickCommandInput input = mapper.treeToValue(commandNode, QuickCommandInput.class);
                if (input.id() != null && !input.id().isBlank()) {
                    return input;
                }
                return new QuickCommandInput(
                        requiredString(params, "id"),
                        input.profileId(),
                        input.groupName(),
                        input.name(),
                        input.command(),
                        input.note()
                );
            }
            QuickCommandInput input = mapper.treeToValue(params, QuickCommandInput.class);
            if (input == null || input.id() == null || input.id().isBlank()) {
                throw new AppError(ErrorCode.COMMAND_VALIDATION_FAILED, "Missing quick command id.", Map.of("field", "id"));
            }
            return input;
        } catch (AppError error) {
            throw error;
        } catch (Exception error) {
            throw new AppError(ErrorCode.IPC_INVALID_REQUEST, "Invalid quick command update params.");
        }
    }

    private Map<String, Object> sendQuickCommandToTerminal(JsonNode params) throws AppError {
        String sessionId = requiredString(params, "sessionId");
        String channelId = requiredString(params, "channelId");
        String command = optionalString(params, "command");
        String commandId = optionalString(params, "commandId");
        if (!hasText(command) && hasText(commandId)) {
            command = profileStore.getQuickCommand(commandId).command();
        }
        if (!hasText(command)) {
            throw new AppError(ErrorCode.COMMAND_VALIDATION_FAILED, "Missing quick command content.", Map.of("field", "command"));
        }
        String data = command.endsWith("\n") ? command : command + "\n";
        sshSessionManager.write(new TerminalWriteRequest(sessionId, channelId, data));
        return Map.of("sessionId", sessionId, "channelId", channelId, "sent", true);
    }

    private String requiredString(JsonNode params, String field) throws AppError {
        String value = optionalString(params, field);
        if (value == null || value.isBlank()) {
            throw new AppError(
                    ErrorCode.IPC_INVALID_REQUEST,
                    "Missing required param: " + field,
                    Map.of("field", field)
            );
        }
        return value;
    }

    private String optionalString(JsonNode params, String field) {
        if (params == null || !params.has(field) || params.get(field).isNull()) {
            return null;
        }
        return params.get(field).asText();
    }

    private boolean optionalBoolean(JsonNode params, String field, boolean fallback) {
        if (params == null || !params.has(field) || params.get(field).isNull()) {
            return fallback;
        }
        return params.get(field).asBoolean();
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
