export type IpcRequest<TParams = unknown> = {
  id: string;
  type: "request";
  method: string;
  params?: TParams;
};

export type IpcSuccessResponse<TResult = unknown> = {
  id: string;
  type: "response";
  ok: true;
  result: TResult;
};

export type IpcError = {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
};

export type IpcErrorResponse = {
  id: string;
  type: "response";
  ok: false;
  error: IpcError;
};

export type IpcResponse<TResult = unknown> =
  | IpcSuccessResponse<TResult>
  | IpcErrorResponse;

export type IpcEvent<TPayload = unknown> = {
  type: "event";
  event: string;
  eventId: string;
  timestamp: string;
  payload: TPayload;
};

export type BackendState = "starting" | "online" | "offline" | "error";

export type BackendStatus = {
  state: BackendState;
  pid?: number;
  startedAt?: string;
  exitedAt?: string;
  exitCode?: number | null;
  signal?: string | null;
  protocolVersion?: string;
  backendVersion?: string;
  logDir: string;
  configDir: string;
  lastError?: string;
};

export type BackendVersion = {
  protocolVersion: string;
  backendVersion: string;
};

export type PingResult = BackendVersion & {
  message: "pong";
  timestamp: string;
};

export type SshAuthType = "password" | "privateKey" | "keyboardInteractive";

export type SshSessionStatus =
  | "CREATED"
  | "CONNECTING"
  | "AUTHENTICATING"
  | "CONNECTED"
  | "DISCONNECTING"
  | "DISCONNECTED"
  | "FAILED";

export type SshConnectParams = {
  profileId?: string;
  sessionId?: string;
  host?: string;
  port?: number;
  username?: string;
  authType?: SshAuthType;
  password?: string;
  privateKeyPath?: string;
  privateKeyContent?: string;
  passphrase?: string;
  connectTimeoutMs?: number;
};

export type SshSessionView = {
  sessionId: string;
  profileId?: string;
  host: string;
  port: number;
  username: string;
  status: SshSessionStatus;
  errorCode?: string;
  errorMessage?: string;
};

export type SshDisconnectParams = {
  sessionId: string;
};

export type TerminalOpenShellParams = {
  sessionId: string;
  channelId?: string;
  cols?: number;
  rows?: number;
  term?: string;
};

export type TerminalOpenShellResult = {
  sessionId: string;
  channelId: string;
  cols: number;
  rows: number;
};

export type TerminalWriteParams = {
  sessionId: string;
  channelId: string;
  data: string;
};

export type TerminalResizeParams = {
  sessionId: string;
  channelId: string;
  cols: number;
  rows: number;
  width?: number;
  height?: number;
};

export type TerminalCloseParams = {
  sessionId: string;
  channelId: string;
};

export type TerminalOutputEvent = {
  sessionId: string;
  channelId: string;
  stream?: "stdout" | "stderr";
  data: string;
};

export type TerminalClosedEvent = {
  sessionId: string;
  channelId: string;
};
