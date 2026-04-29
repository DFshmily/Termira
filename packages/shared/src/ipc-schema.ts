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
