package com.termira.forwarding;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.connection.channel.direct.DirectConnection;

final class DynamicSocksForwarder implements AutoCloseable {
    private static final int SOCKS_VERSION = 0x05;
    private static final int METHOD_NO_AUTH = 0x00;
    private static final int METHOD_NOT_ACCEPTABLE = 0xff;
    private static final int CMD_CONNECT = 0x01;
    private static final int ATYP_IPV4 = 0x01;
    private static final int ATYP_DOMAIN = 0x03;
    private static final int ATYP_IPV6 = 0x04;

    private final SSHClient client;
    private final ServerSocket serverSocket;
    private final ExecutorService executor;
    private volatile boolean closed;

    DynamicSocksForwarder(SSHClient client, ServerSocket serverSocket, ExecutorService executor) {
        this.client = client;
        this.serverSocket = serverSocket;
        this.executor = executor;
    }

    void listen() throws IOException {
        while (!closed && !serverSocket.isClosed()) {
            Socket socket = serverSocket.accept();
            executor.execute(() -> handleClient(socket));
        }
    }

    @Override
    public void close() throws IOException {
        closed = true;
        serverSocket.close();
    }

    private void handleClient(Socket socket) {
        try (Socket clientSocket = socket) {
            clientSocket.setTcpNoDelay(true);
            SocksTarget target = negotiate(clientSocket.getInputStream(), clientSocket.getOutputStream());
            DirectConnection channel = null;
            try {
                channel = client.newDirectConnection(target.host(), target.port());
                sendReply(clientSocket.getOutputStream(), 0x00);
                relay(clientSocket, channel);
            } catch (IOException error) {
                sendReply(clientSocket.getOutputStream(), 0x05);
            } finally {
                closeQuietly(channel);
            }
        } catch (IOException ignored) {
            // Individual SOCKS clients can disconnect at any handshake or relay step.
        }
    }

    private SocksTarget negotiate(InputStream input, OutputStream output) throws IOException {
        if (readByte(input) != SOCKS_VERSION) {
            throw new IOException("Unsupported SOCKS version.");
        }
        int methodCount = readByte(input);
        byte[] methods = readBytes(input, methodCount);
        boolean supportsNoAuth = false;
        for (byte method : methods) {
            if ((method & 0xff) == METHOD_NO_AUTH) {
                supportsNoAuth = true;
                break;
            }
        }
        if (!supportsNoAuth) {
            output.write(new byte[]{SOCKS_VERSION, (byte) METHOD_NOT_ACCEPTABLE});
            output.flush();
            throw new IOException("SOCKS client does not support no-auth mode.");
        }
        output.write(new byte[]{SOCKS_VERSION, METHOD_NO_AUTH});
        output.flush();

        if (readByte(input) != SOCKS_VERSION) {
            throw new IOException("Unsupported SOCKS request version.");
        }
        int command = readByte(input);
        readByte(input);
        int addressType = readByte(input);
        String host = switch (addressType) {
            case ATYP_IPV4 -> InetAddress.getByAddress(readBytes(input, 4)).getHostAddress();
            case ATYP_DOMAIN -> new String(readBytes(input, readByte(input)), StandardCharsets.UTF_8);
            case ATYP_IPV6 -> InetAddress.getByAddress(readBytes(input, 16)).getHostAddress();
            default -> throw new IOException("Unsupported SOCKS address type.");
        };
        int port = (readByte(input) << 8) | readByte(input);
        if (command != CMD_CONNECT) {
            sendReply(output, 0x07);
            throw new IOException("Unsupported SOCKS command.");
        }
        return new SocksTarget(host, port);
    }

    private void relay(Socket clientSocket, DirectConnection channel) throws IOException {
        InputStream clientInput = clientSocket.getInputStream();
        OutputStream clientOutput = clientSocket.getOutputStream();
        InputStream channelInput = channel.getInputStream();
        OutputStream channelOutput = channel.getOutputStream();
        Future<?> clientToChannel = executor.submit(() -> copyUnchecked(clientInput, channelOutput));
        Future<?> channelToClient = executor.submit(() -> copyUnchecked(channelInput, clientOutput));
        try {
            waitForEither(clientToChannel, channelToClient);
        } finally {
            closeQuietly(channel);
            closeQuietly(clientSocket);
            clientToChannel.cancel(true);
            channelToClient.cancel(true);
        }
    }

    private void waitForEither(Future<?> first, Future<?> second) throws IOException {
        while (!first.isDone() && !second.isDone()) {
            try {
                Thread.sleep(50);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new IOException("SOCKS relay interrupted.", error);
            }
        }
        inspectCompleted(first);
        inspectCompleted(second);
    }

    private void inspectCompleted(Future<?> future) throws IOException {
        if (!future.isDone() || future.isCancelled()) {
            return;
        }
        try {
            future.get();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IOException("SOCKS relay interrupted.", error);
        } catch (ExecutionException error) {
            Throwable cause = error.getCause();
            if (cause instanceof IOException ioException) {
                throw ioException;
            }
            if (cause instanceof UncheckedIOException ioException) {
                throw ioException.getCause();
            }
            throw new IOException("SOCKS relay failed.", cause);
        }
    }

    private void copyUnchecked(InputStream input, OutputStream output) {
        try {
            copy(input, output);
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    private void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[32 * 1024];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
            output.flush();
        }
    }

    private void sendReply(OutputStream output, int code) throws IOException {
        output.write(new byte[]{SOCKS_VERSION, (byte) code, 0x00, ATYP_IPV4, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00});
        output.flush();
    }

    private int readByte(InputStream input) throws IOException {
        int value = input.read();
        if (value < 0) {
            throw new EOFException("Unexpected end of SOCKS stream.");
        }
        return value;
    }

    private byte[] readBytes(InputStream input, int length) throws IOException {
        byte[] bytes = input.readNBytes(length);
        if (bytes.length != length) {
            throw new EOFException("Unexpected end of SOCKS stream: " + Arrays.toString(bytes));
        }
        return bytes;
    }

    private void closeQuietly(AutoCloseable closeable) {
        if (closeable == null) {
            return;
        }
        try {
            closeable.close();
        } catch (Exception ignored) {
        }
    }

    private record SocksTarget(String host, int port) {
    }
}
