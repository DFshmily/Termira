package com.termira.forwarding;

import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import com.termira.ipc.IpcEvent;
import com.termira.ipc.IpcEventSink;
import com.termira.profile.ForwardRule;
import com.termira.profile.ForwardRuleInput;
import com.termira.profile.ProfileStore;
import com.termira.ssh.SshSessionManager;
import java.io.IOException;
import java.net.BindException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.SocketException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.connection.channel.direct.LocalPortForwarder;
import net.schmizz.sshj.connection.channel.direct.Parameters;
import net.schmizz.sshj.connection.channel.forwarded.RemotePortForwarder;
import net.schmizz.sshj.connection.channel.forwarded.SocketForwardingConnectListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class ForwardingManager implements AutoCloseable {
    private static final Logger LOGGER = LoggerFactory.getLogger(ForwardingManager.class);

    private final ProfileStore profileStore;
    private final SshSessionManager sshSessionManager;
    private final Map<String, ActiveForward> activeForwards = new ConcurrentHashMap<>();
    private final Map<String, RuntimeState> runtimeStates = new ConcurrentHashMap<>();
    private final ExecutorService forwardingExecutor = Executors.newCachedThreadPool(daemonThreadFactory());
    private volatile IpcEventSink eventSink;

    public ForwardingManager(ProfileStore profileStore, SshSessionManager sshSessionManager, IpcEventSink eventSink) {
        this.profileStore = profileStore;
        this.sshSessionManager = sshSessionManager;
        this.eventSink = eventSink == null ? IpcEventSink.NOOP : eventSink;
    }

    public void setEventSink(IpcEventSink eventSink) {
        this.eventSink = eventSink == null ? IpcEventSink.NOOP : eventSink;
    }

    public List<ForwardRuleView> list(String profileId) throws AppError {
        return profileStore.listForwardRules(profileId).stream()
                .map(this::view)
                .toList();
    }

    public ForwardRuleView create(ForwardRuleInput input) throws AppError {
        ForwardRule rule = profileStore.saveForwardRule(normalizeInput(input));
        runtimeStates.putIfAbsent(rule.id(), RuntimeState.stopped());
        return view(rule);
    }

    public ForwardRuleView update(ForwardRuleInput input) throws AppError {
        if (input == null || !hasText(input.id())) {
            throw validation("Missing forward rule id.", "id");
        }
        stopIfActive(input.id());
        ForwardRule rule = profileStore.saveForwardRule(normalizeInput(input));
        runtimeStates.put(rule.id(), RuntimeState.stopped());
        return view(rule);
    }

    public Map<String, Object> delete(String id) throws AppError {
        String forwardingId = requireText(id, "id");
        stopIfActive(forwardingId);
        runtimeStates.remove(forwardingId);
        return Map.of("deleted", profileStore.deleteForwardRule(forwardingId));
    }

    public synchronized ForwardRuleView start(ForwardStartRequest request) throws AppError {
        String forwardingId = requireText(request == null ? null : request.id(), "id");
        String sessionId = requireText(request == null ? null : request.sessionId(), "sessionId");
        ActiveForward existing = activeForwards.get(forwardingId);
        if (existing != null && !existing.closing()) {
            return view(existing.rule());
        }

        ForwardRule rule = profileStore.getForwardRule(forwardingId);
        validateRuleForStart(rule);
        updateState(rule, RuntimeState.starting(sessionId));

        try {
            SSHClient client = sshSessionManager.requireConnectedClient(sessionId);
            ActiveForward active = switch (rule.type()) {
                case "local" -> startLocal(rule, sessionId, client);
                case "remote" -> startRemote(rule, sessionId, client);
                case "dynamic" -> startDynamic(rule, sessionId, client);
                default -> throw validation("Unsupported forward rule type.", "type");
            };
            activeForwards.put(rule.id(), active);
            LOGGER.info("forward.start forwardingId={} type={} bind={}:{} status=running",
                    rule.id(), rule.type(), rule.bindHost(), rule.bindPort());
            return updateState(rule, RuntimeState.running(sessionId));
        } catch (AppError error) {
            fail(rule, sessionId, error.code(), error.getMessage());
            throw error;
        } catch (Exception error) {
            AppError mapped = mapStartError(error, rule);
            fail(rule, sessionId, mapped.code(), mapped.getMessage());
            throw mapped;
        }
    }

    public synchronized ForwardRuleView stop(ForwardStopRequest request) throws AppError {
        return stopById(requireText(request == null ? null : request.id(), "id"));
    }

    public void closeSession(String sessionId) {
        if (!hasText(sessionId)) {
            return;
        }
        List<String> ids = activeForwards.values().stream()
                .filter(active -> sessionId.equals(active.sessionId()))
                .map(active -> active.rule().id())
                .toList();
        for (String id : ids) {
            try {
                stopById(id);
            } catch (AppError error) {
                LOGGER.debug("Failed to stop forwarding for session {}: {}", sessionId, error.getMessage());
            }
        }
    }

    @Override
    public void close() {
        for (String id : new ArrayList<>(activeForwards.keySet())) {
            try {
                stopById(id);
            } catch (AppError error) {
                LOGGER.debug("Failed to stop forwarding {}: {}", id, error.getMessage());
            }
        }
        forwardingExecutor.shutdownNow();
    }

    private ForwardRuleView stopById(String forwardingId) throws AppError {
        ForwardRule rule = profileStore.getForwardRule(forwardingId);
        ActiveForward active = activeForwards.remove(forwardingId);
        if (active == null) {
            return updateState(rule, RuntimeState.stopped());
        }

        updateState(rule, RuntimeState.stopping(active.sessionId()));
        active.closeQuietly();
        LOGGER.info("forward.stop forwardingId={} type={} bind={}:{} status=stopped",
                rule.id(), rule.type(), rule.bindHost(), rule.bindPort());
        return updateState(rule, RuntimeState.stopped());
    }

    private void stopIfActive(String forwardingId) throws AppError {
        if (activeForwards.containsKey(forwardingId)) {
            stopById(forwardingId);
        }
    }

    private ActiveForward startLocal(ForwardRule rule, String sessionId, SSHClient client) throws AppError, IOException {
        ServerSocket serverSocket = bindServerSocket(rule);
        Parameters parameters = new Parameters(rule.bindHost(), rule.bindPort(), rule.targetHost(), rule.targetPort());
        LocalPortForwarder forwarder = client.newLocalPortForwarder(parameters, serverSocket);
        ActiveForward active = ActiveForward.local(rule, sessionId, forwarder);
        Thread listenerThread = startListenerThread(active, () -> forwarder.listen());
        active.listenerThread(listenerThread);
        return active;
    }

    private ActiveForward startRemote(ForwardRule rule, String sessionId, SSHClient client) throws AppError {
        try {
            RemotePortForwarder remotePortForwarder = client.getRemotePortForwarder();
            RemotePortForwarder.Forward requested = new RemotePortForwarder.Forward(rule.bindHost(), rule.bindPort());
            SocketForwardingConnectListener listener = new SocketForwardingConnectListener(
                    new InetSocketAddress(rule.targetHost(), rule.targetPort())
            );
            RemotePortForwarder.Forward bound = remotePortForwarder.bind(requested, listener);
            return ActiveForward.remote(rule, sessionId, remotePortForwarder, bound);
        } catch (Exception error) {
            throw new AppError(
                    ErrorCode.FORWARD_OPERATION_FAILED,
                    "Remote forwarding is not allowed or failed to start.",
                    Map.of("forwardingId", rule.id(), "cause", error.getClass().getSimpleName())
            );
        }
    }

    private ActiveForward startDynamic(ForwardRule rule, String sessionId, SSHClient client) throws AppError, IOException {
        ServerSocket serverSocket = bindServerSocket(rule);
        DynamicSocksForwarder socksForwarder = new DynamicSocksForwarder(client, serverSocket, forwardingExecutor);
        ActiveForward active = ActiveForward.dynamic(rule, sessionId, socksForwarder);
        Thread listenerThread = startListenerThread(active, socksForwarder::listen);
        active.listenerThread(listenerThread);
        return active;
    }

    private ServerSocket bindServerSocket(ForwardRule rule) throws AppError {
        try {
            ServerSocket serverSocket = new ServerSocket();
            serverSocket.setReuseAddress(false);
            serverSocket.bind(new InetSocketAddress(rule.bindHost(), rule.bindPort()));
            return serverSocket;
        } catch (BindException error) {
            throw portInUse(rule);
        } catch (SocketException error) {
            throw new AppError(
                    ErrorCode.FORWARD_OPERATION_FAILED,
                    "Failed to configure local forwarding socket.",
                    Map.of("forwardingId", rule.id(), "cause", error.getClass().getSimpleName())
            );
        } catch (IOException error) {
            if (isAddressInUse(error)) {
                throw portInUse(rule);
            }
            throw new AppError(
                    ErrorCode.FORWARD_OPERATION_FAILED,
                    "Failed to bind local forwarding port.",
                    Map.of("forwardingId", rule.id(), "bindHost", rule.bindHost(), "bindPort", rule.bindPort())
            );
        }
    }

    private Thread startListenerThread(ActiveForward active, ThrowingRunnable runnable) {
        Thread thread = new Thread(() -> {
            try {
                runnable.run();
            } catch (IOException error) {
                if (!active.closing()) {
                    handleRuntimeFailure(active, error);
                }
            }
        }, "termira-forward-" + active.rule().id());
        thread.setDaemon(true);
        thread.start();
        return thread;
    }

    private void handleRuntimeFailure(ActiveForward active, Exception error) {
        activeForwards.remove(active.rule().id());
        active.closeQuietly();
        fail(active.rule(), active.sessionId(), ErrorCode.FORWARD_OPERATION_FAILED, "Forwarding stopped unexpectedly.");
        LOGGER.warn("forward.runtimeFailed forwardingId={} type={} cause={}",
                active.rule().id(), active.rule().type(), error.getClass().getSimpleName());
    }

    private ForwardRuleView updateState(ForwardRule rule, RuntimeState state) {
        runtimeStates.put(rule.id(), state);
        ForwardRuleView view = view(rule, state);
        eventSink.emit(IpcEvent.create("forward.statusChanged", view));
        return view;
    }

    private ForwardRuleView fail(ForwardRule rule, String sessionId, String code, String message) {
        activeForwards.remove(rule.id());
        return updateState(rule, RuntimeState.failed(sessionId, code, message));
    }

    private ForwardRuleView view(ForwardRule rule) {
        return view(rule, runtimeStates.getOrDefault(rule.id(), RuntimeState.stopped()));
    }

    private ForwardRuleView view(ForwardRule rule, RuntimeState state) {
        return new ForwardRuleView(
                rule.id(),
                rule.id(),
                rule.profileId(),
                rule.name(),
                rule.type(),
                rule.bindHost(),
                rule.bindPort(),
                rule.targetHost(),
                rule.targetPort(),
                rule.autoStart(),
                state.status(),
                state.sessionId(),
                state.errorCode(),
                state.errorMessage(),
                rule.createdAt(),
                rule.updatedAt(),
                state.changedAt()
        );
    }

    private ForwardRuleInput normalizeInput(ForwardRuleInput input) {
        if (input == null) {
            return null;
        }
        return new ForwardRuleInput(
                blankToNull(input.id()),
                blankToNull(input.profileId()),
                blankToNull(input.name()),
                blankToNull(input.type()) == null ? null : blankToNull(input.type()).toLowerCase(Locale.ROOT),
                blankToNull(input.bindHost()),
                input.bindPort(),
                blankToNull(input.targetHost()),
                input.targetPort(),
                Boolean.TRUE.equals(input.autoStart())
        );
    }

    private void validateRuleForStart(ForwardRule rule) throws AppError {
        validatePort(rule.bindPort(), "bindPort");
        requireText(rule.bindHost(), "bindHost");
        if (!Objects.equals("local", rule.type()) && !Objects.equals("remote", rule.type()) && !Objects.equals("dynamic", rule.type())) {
            throw validation("Unsupported forward rule type.", "type");
        }
        if (!"dynamic".equals(rule.type())) {
            requireText(rule.targetHost(), "targetHost");
            validatePort(rule.targetPort(), "targetPort");
        }
    }

    private void validatePort(Integer value, String field) throws AppError {
        if (value == null || value < 1 || value > 65535) {
            throw validation("Invalid forwarding port.", field);
        }
    }

    private AppError mapStartError(Exception error, ForwardRule rule) {
        if (isAddressInUse(error)) {
            return portInUse(rule);
        }
        return new AppError(
                ErrorCode.FORWARD_OPERATION_FAILED,
                "Failed to start forwarding.",
                Map.of("forwardingId", rule.id(), "cause", error.getClass().getSimpleName())
        );
    }

    private AppError portInUse(ForwardRule rule) {
        return new AppError(
                ErrorCode.FORWARD_PORT_IN_USE,
                "Forwarding bind port is already in use.",
                Map.of("forwardingId", rule.id(), "bindHost", rule.bindHost(), "bindPort", rule.bindPort())
        );
    }

    private boolean isAddressInUse(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof BindException) {
                return true;
            }
            String message = current.getMessage();
            if (message != null && message.toLowerCase(Locale.ROOT).contains("address already in use")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private AppError validation(String message, String field) {
        return new AppError(ErrorCode.FORWARD_VALIDATION_FAILED, message, Map.of("field", field));
    }

    private String requireText(String value, String field) throws AppError {
        if (!hasText(value)) {
            throw validation("Missing required forwarding field: " + field, field);
        }
        return value.trim();
    }

    private String blankToNull(String value) {
        return hasText(value) ? value.trim() : null;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static ThreadFactory daemonThreadFactory() {
        return runnable -> {
            Thread thread = new Thread(runnable, "termira-forwarding-io");
            thread.setDaemon(true);
            return thread;
        };
    }

    private interface ThrowingRunnable {
        void run() throws IOException;
    }

    private record RuntimeState(
            ForwardStatus status,
            String sessionId,
            String errorCode,
            String errorMessage,
            String changedAt
    ) {
        static RuntimeState starting(String sessionId) {
            return new RuntimeState(ForwardStatus.STARTING, sessionId, null, null, Instant.now().toString());
        }

        static RuntimeState running(String sessionId) {
            return new RuntimeState(ForwardStatus.RUNNING, sessionId, null, null, Instant.now().toString());
        }

        static RuntimeState stopping(String sessionId) {
            return new RuntimeState(ForwardStatus.STOPPING, sessionId, null, null, Instant.now().toString());
        }

        static RuntimeState stopped() {
            return new RuntimeState(ForwardStatus.STOPPED, null, null, null, Instant.now().toString());
        }

        static RuntimeState failed(String sessionId, String errorCode, String errorMessage) {
            return new RuntimeState(ForwardStatus.FAILED, sessionId, errorCode, errorMessage, Instant.now().toString());
        }
    }

    private static final class ActiveForward {
        private final ForwardRule rule;
        private final String sessionId;
        private final LocalPortForwarder localPortForwarder;
        private final RemotePortForwarder remotePortForwarder;
        private final RemotePortForwarder.Forward remoteForward;
        private final DynamicSocksForwarder dynamicSocksForwarder;
        private volatile Thread listenerThread;
        private volatile boolean closing;

        private ActiveForward(
                ForwardRule rule,
                String sessionId,
                LocalPortForwarder localPortForwarder,
                RemotePortForwarder remotePortForwarder,
                RemotePortForwarder.Forward remoteForward,
                DynamicSocksForwarder dynamicSocksForwarder
        ) {
            this.rule = rule;
            this.sessionId = sessionId;
            this.localPortForwarder = localPortForwarder;
            this.remotePortForwarder = remotePortForwarder;
            this.remoteForward = remoteForward;
            this.dynamicSocksForwarder = dynamicSocksForwarder;
        }

        static ActiveForward local(ForwardRule rule, String sessionId, LocalPortForwarder forwarder) {
            return new ActiveForward(rule, sessionId, forwarder, null, null, null);
        }

        static ActiveForward remote(ForwardRule rule, String sessionId, RemotePortForwarder forwarder, RemotePortForwarder.Forward remoteForward) {
            return new ActiveForward(rule, sessionId, null, forwarder, remoteForward, null);
        }

        static ActiveForward dynamic(ForwardRule rule, String sessionId, DynamicSocksForwarder forwarder) {
            return new ActiveForward(rule, sessionId, null, null, null, forwarder);
        }

        ForwardRule rule() {
            return rule;
        }

        String sessionId() {
            return sessionId;
        }

        boolean closing() {
            return closing;
        }

        void listenerThread(Thread listenerThread) {
            this.listenerThread = listenerThread;
        }

        void closeQuietly() {
            closing = true;
            try {
                if (localPortForwarder != null) {
                    localPortForwarder.close();
                }
            } catch (IOException ignored) {
            }
            try {
                if (remotePortForwarder != null && remoteForward != null) {
                    remotePortForwarder.cancel(remoteForward);
                }
            } catch (Exception ignored) {
            }
            try {
                if (dynamicSocksForwarder != null) {
                    dynamicSocksForwarder.close();
                }
            } catch (IOException ignored) {
            }
            Thread thread = listenerThread;
            if (thread != null) {
                thread.interrupt();
            }
        }
    }
}
