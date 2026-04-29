package com.termira.error;

public final class ErrorCode {
    public static final String IPC_INVALID_REQUEST = "IPC_INVALID_REQUEST";
    public static final String IPC_UNKNOWN_METHOD = "IPC_UNKNOWN_METHOD";
    public static final String PROFILE_NOT_FOUND = "PROFILE_NOT_FOUND";
    public static final String PROFILE_STORAGE_ERROR = "PROFILE_STORAGE_ERROR";
    public static final String PROFILE_VALIDATION_FAILED = "PROFILE_VALIDATION_FAILED";
    public static final String VAULT_NOT_INITIALIZED = "VAULT_NOT_INITIALIZED";
    public static final String VAULT_LOCKED = "VAULT_LOCKED";
    public static final String VAULT_UNLOCK_FAILED = "VAULT_UNLOCK_FAILED";
    public static final String VAULT_STORAGE_ERROR = "VAULT_STORAGE_ERROR";
    public static final String VAULT_VALIDATION_FAILED = "VAULT_VALIDATION_FAILED";
    public static final String CREDENTIAL_NOT_FOUND = "CREDENTIAL_NOT_FOUND";
    public static final String CREDENTIAL_VALIDATION_FAILED = "CREDENTIAL_VALIDATION_FAILED";
    public static final String SSH_AUTH_FAILED = "SSH_AUTH_FAILED";
    public static final String SSH_CONNECT_TIMEOUT = "SSH_CONNECT_TIMEOUT";
    public static final String SSH_NETWORK_UNREACHABLE = "SSH_NETWORK_UNREACHABLE";
    public static final String SSH_SESSION_NOT_FOUND = "SSH_SESSION_NOT_FOUND";
    public static final String SSH_TERMINAL_NOT_FOUND = "SSH_TERMINAL_NOT_FOUND";
    public static final String SSH_CHANNEL_OPEN_FAILED = "SSH_CHANNEL_OPEN_FAILED";
    public static final String SSH_CHANNEL_WRITE_FAILED = "SSH_CHANNEL_WRITE_FAILED";
    public static final String SSH_VALIDATION_FAILED = "SSH_VALIDATION_FAILED";

    private ErrorCode() {
    }
}
