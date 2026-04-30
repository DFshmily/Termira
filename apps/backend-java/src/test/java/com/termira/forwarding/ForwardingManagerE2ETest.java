package com.termira.forwarding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.termira.error.AppError;
import com.termira.error.ErrorCode;
import com.termira.profile.AuthConfig;
import com.termira.profile.ForwardRuleInput;
import com.termira.profile.HostProfile;
import com.termira.profile.HostProfileInput;
import com.termira.profile.ProfileStore;
import com.termira.ssh.SshConnectRequest;
import com.termira.ssh.SshDisconnectRequest;
import com.termira.ssh.SshSessionManager;
import com.termira.ssh.SshSessionView;
import com.termira.ssh.SshStatus;
import com.termira.vault.VaultManager;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import net.schmizz.sshj.connection.channel.direct.DirectConnection;
import net.schmizz.sshj.connection.channel.direct.Session;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ForwardingManagerE2ETest {
    @TempDir
    Path tempDir;

    @Test
    void forwardsLocalRemoteAndDynamicAgainstEnvHost() throws Exception {
        String host = System.getenv("TERMIRA_E2E_SSH_HOST");
        String username = System.getenv("TERMIRA_E2E_SSH_USER");
        String password = System.getenv("TERMIRA_E2E_SSH_PASSWORD");
        assumeTrue(hasText(host) && hasText(username) && hasText(password), "TERMIRA_E2E_SSH_* env vars are required.");

        ProfileStore profileStore = new ProfileStore(tempDir.resolve("profiles.db"));
        VaultManager vaultManager = new VaultManager(tempDir.resolve("vault.dat"), tempDir.resolve("vault.local.key"));
        SshSessionManager sshManager = new SshSessionManager(profileStore, vaultManager, event -> {
        });
        ForwardingManager forwardingManager = new ForwardingManager(profileStore, sshManager, event -> {
        });
        SshSessionView session = null;

        try {
            HostProfile profile = createProfile(profileStore, host, username);
            session = sshManager.connect(new SshConnectRequest(
                    null,
                    "forward_e2e",
                    host,
                    22,
                    username,
                    "password",
                    password,
                    null,
                    null,
                    null,
                    20_000
            ));
            assertThat(session.status()).isEqualTo(SshStatus.CONNECTED);
            String connectedSessionId = session.sessionId();

            int remoteLocalTargetPort = 26000 + (int) (System.nanoTime() % 20000);
            int localPort = freeLocalPort();
            try (RemoteOneShotServer ignored = startRemoteOneShotServer(sshManager, connectedSessionId, remoteLocalTargetPort, "TERMIRA_LOCAL_FORWARD_OK")) {
                ForwardRuleView localRule = forwardingManager.create(new ForwardRuleInput(
                        null,
                        profile.id(),
                        "E2E local",
                        "local",
                        "127.0.0.1",
                        localPort,
                        "127.0.0.1",
                        remoteLocalTargetPort
                ));
                assertThat(forwardingManager.start(new ForwardStartRequest(localRule.id(), connectedSessionId)).status()).isEqualTo(ForwardStatus.RUNNING);
                assertThat(readTcpLine("127.0.0.1", localPort)).isEqualTo("TERMIRA_LOCAL_FORWARD_OK");
                forwardingManager.stop(new ForwardStopRequest(localRule.id()));
                assertPortReleased(localPort);
            }

            int occupiedPort = freeLocalPort();
            try (ServerSocket occupied = new ServerSocket()) {
                occupied.bind(new InetSocketAddress("127.0.0.1", occupiedPort));
                ForwardRuleView occupiedRule = forwardingManager.create(new ForwardRuleInput(
                        null,
                        profile.id(),
                        "E2E occupied",
                        "local",
                        "127.0.0.1",
                        occupiedPort,
                        "127.0.0.1",
                        22
                ));
                SshSessionView connectedSession = session;
                assertThatThrownBy(() -> forwardingManager.start(new ForwardStartRequest(occupiedRule.id(), connectedSession.sessionId())))
                        .isInstanceOfSatisfying(AppError.class, error ->
                                assertThat(error.code()).isEqualTo(ErrorCode.FORWARD_PORT_IN_USE));
            }

            int remoteSocksTargetPort = 26000 + (int) (System.nanoTime() % 20000);
            try (RemoteOneShotServer ignored = startRemoteOneShotServer(sshManager, connectedSessionId, remoteSocksTargetPort, "TERMIRA_SOCKS_FORWARD_OK")) {
                int socksPort = freeLocalPort();
                ForwardRuleView dynamicRule = forwardingManager.create(new ForwardRuleInput(
                        null,
                        profile.id(),
                        "E2E SOCKS",
                        "dynamic",
                        "127.0.0.1",
                        socksPort,
                        null,
                        null
                ));
                assertThat(forwardingManager.start(new ForwardStartRequest(dynamicRule.id(), connectedSessionId)).status()).isEqualTo(ForwardStatus.RUNNING);
                assertThat(readSocksForwardedLine(socksPort, remoteSocksTargetPort)).isEqualTo("TERMIRA_SOCKS_FORWARD_OK");
                forwardingManager.stop(new ForwardStopRequest(dynamicRule.id()));
            }

            int localTargetPort = freeLocalPort();
            int remoteBindPort = 28000 + (int) (System.nanoTime() % 20000);
            try (LocalOneShotServer localTarget = new LocalOneShotServer(localTargetPort, "TERMIRA_REMOTE_FORWARD_OK\n")) {
                ForwardRuleView remoteRule = forwardingManager.create(new ForwardRuleInput(
                        null,
                        profile.id(),
                        "E2E remote",
                        "remote",
                        "127.0.0.1",
                        remoteBindPort,
                        "127.0.0.1",
                        localTargetPort
                ));
                assertThat(forwardingManager.start(new ForwardStartRequest(remoteRule.id(), session.sessionId())).status()).isEqualTo(ForwardStatus.RUNNING);
                assertThat(readRemoteForward(session, sshManager, remoteBindPort)).isEqualTo("TERMIRA_REMOTE_FORWARD_OK");
                forwardingManager.stop(new ForwardStopRequest(remoteRule.id()));
            }
        } finally {
            forwardingManager.close();
            if (session != null) {
                sshManager.disconnect(new SshDisconnectRequest(session.sessionId()));
            }
            sshManager.close();
        }
    }

    private HostProfile createProfile(ProfileStore profileStore, String host, String username) throws AppError {
        return profileStore.createProfile(new HostProfileInput(
                null,
                "Forward E2E",
                host,
                22,
                username,
                null,
                "E2E",
                List.of(),
                null,
                new AuthConfig("password", null, null, false),
                null,
                false
        ));
    }

    private RemoteOneShotServer startRemoteOneShotServer(SshSessionManager sshManager, String sessionId, int port, String response) throws Exception {
        String command = "python3 -u -c \"import socket,sys;"
                + "s=socket.socket();"
                + "s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1);"
                + "s.bind(('127.0.0.1'," + port + "));"
                + "s.listen(1);"
                + "print('READY', flush=True);"
                + "c,a=s.accept();"
                + "c.sendall(b'" + response + "\\n');"
                + "c.close();"
                + "s.close()\"";
        Session remoteSession = sshManager.requireConnectedClient(sessionId).startSession();
        Session.Command remoteCommand = remoteSession.exec(command);
        RemoteOneShotServer server = new RemoteOneShotServer(remoteSession, remoteCommand);
        server.waitUntilReady();
        return server;
    }

    private String readTcpLine(String host, int port) throws IOException, InterruptedException {
        IOException lastError = null;
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            try (Socket socket = new Socket(Proxy.NO_PROXY)) {
                socket.connect(new InetSocketAddress(host, port), 1_000);
                socket.setSoTimeout(2_000);
                String line = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8)).readLine();
                if (line != null) {
                    return line;
                }
            } catch (IOException error) {
                lastError = error;
            }
            Thread.sleep(100);
        }
        if (lastError != null) {
            throw lastError;
        }
        throw new IOException("Timed out waiting for TCP line.");
    }

    private String readSocksForwardedLine(int socksPort, int remoteTargetPort) throws IOException {
        try (Socket socket = new Socket(Proxy.NO_PROXY)) {
            socket.connect(new InetSocketAddress("127.0.0.1", socksPort), 5_000);
            socket.setSoTimeout(5_000);
            OutputStream output = socket.getOutputStream();
            output.write(new byte[]{0x05, 0x01, 0x00});
            output.flush();
            assertThat(socket.getInputStream().readNBytes(2)).containsExactly(0x05, 0x00);
            output.write(new byte[]{
                    0x05,
                    0x01,
                    0x00,
                    0x01,
                    127,
                    0,
                    0,
                    1,
                    (byte) ((remoteTargetPort >> 8) & 0xff),
                    (byte) (remoteTargetPort & 0xff)
            });
            output.flush();
            byte[] reply = socket.getInputStream().readNBytes(10);
            assertThat(reply[1]).isEqualTo((byte) 0x00);
            return new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8)).readLine();
        }
    }

    private String readRemoteForward(SshSessionView session, SshSessionManager sshManager, int remoteBindPort) throws Exception {
        DirectConnection connection = sshManager.requireConnectedClient(session.sessionId()).newDirectConnection("127.0.0.1", remoteBindPort);
        try (connection) {
            return new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)).readLine();
        }
    }

    private int freeLocalPort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            socket.setReuseAddress(false);
            return socket.getLocalPort();
        }
    }

    private void assertPortReleased(int port) throws IOException {
        try (ServerSocket socket = new ServerSocket()) {
            socket.bind(new InetSocketAddress("127.0.0.1", port));
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static final class LocalOneShotServer implements AutoCloseable {
        private final ServerSocket serverSocket;
        private final Thread thread;
        private final CountDownLatch ready = new CountDownLatch(1);

        LocalOneShotServer(int port, String response) throws InterruptedException, IOException {
            serverSocket = new ServerSocket();
            serverSocket.bind(new InetSocketAddress("127.0.0.1", port));
            thread = new Thread(() -> {
                ready.countDown();
                try (Socket socket = serverSocket.accept()) {
                    socket.getOutputStream().write(response.getBytes(StandardCharsets.UTF_8));
                    socket.getOutputStream().flush();
                } catch (IOException ignored) {
                }
            }, "termira-forward-e2e-local-target");
            thread.setDaemon(true);
            thread.start();
            ready.await(5, TimeUnit.SECONDS);
        }

        @Override
        public void close() throws IOException {
            serverSocket.close();
            thread.interrupt();
        }
    }

    private static final class RemoteOneShotServer implements AutoCloseable {
        private final Session session;
        private final Session.Command command;
        private final BufferedReader stdout;
        private final BufferedReader stderr;

        RemoteOneShotServer(Session session, Session.Command command) {
            this.session = session;
            this.command = command;
            this.stdout = new BufferedReader(new InputStreamReader(command.getInputStream(), StandardCharsets.UTF_8));
            this.stderr = new BufferedReader(new InputStreamReader(command.getErrorStream(), StandardCharsets.UTF_8));
        }

        void waitUntilReady() throws IOException, InterruptedException {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline) {
                if (stdout.ready()) {
                    String line = stdout.readLine();
                    if ("READY".equals(line)) {
                        return;
                    }
                }
                if (command.getExitStatus() != null) {
                    throw new IOException("Remote one-shot server exited early: " + readAvailable(stderr));
                }
                Thread.sleep(50);
            }
            throw new IOException("Timed out waiting for remote one-shot server. stderr=" + readAvailable(stderr));
        }

        private String readAvailable(BufferedReader reader) throws IOException {
            StringBuilder text = new StringBuilder();
            while (reader.ready()) {
                String line = reader.readLine();
                if (line == null) {
                    break;
                }
                if (!text.isEmpty()) {
                    text.append('\n');
                }
                text.append(line);
            }
            return text.toString();
        }

        @Override
        public void close() {
            try {
                command.close();
            } catch (Exception ignored) {
            }
            try {
                session.close();
            } catch (Exception ignored) {
            }
        }
    }
}
