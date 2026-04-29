import { app } from "electron";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

type BackendState = "starting" | "online" | "offline" | "error";

type BackendStatus = {
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

type IpcSuccessResponse = {
  id: string;
  type: "response";
  ok: true;
  result: unknown;
};

type IpcErrorResponse = {
  id: string;
  type: "response";
  ok: false;
  error: {
    code: string;
    message: string;
    detail?: Record<string, unknown>;
  };
};

type IpcResponse = IpcSuccessResponse | IpcErrorResponse;

type IpcEvent = {
  type: "event";
  event: string;
  eventId: string;
  timestamp: string;
  payload: unknown;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
};

const PROTOCOL_VERSION = "1.0.0";

export class SidecarManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, PendingRequest>();
  private sequence = 0;
  private listeners = new Set<(message: IpcEvent) => void>();
  private status: BackendStatus;

  constructor() {
    this.status = {
      state: "offline",
      logDir: this.resolveLogDir(),
      configDir: this.resolveConfigDir()
    };
  }

  onEvent(listener: (message: IpcEvent) => void): void {
    this.listeners.add(listener);
  }

  isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null && !this.child.killed;
  }

  getStatus(): BackendStatus {
    return { ...this.status };
  }

  async start(): Promise<void> {
    if (this.isRunning()) {
      return;
    }

    this.status = {
      ...this.status,
      logDir: this.resolveLogDir(),
      configDir: this.resolveConfigDir()
    };
    fs.mkdirSync(this.status.logDir, { recursive: true });
    fs.mkdirSync(this.status.configDir, { recursive: true });

    const launch = this.resolveLaunchCommand();
    this.status = {
      state: "starting",
      startedAt: new Date().toISOString(),
      logDir: this.status.logDir,
      configDir: this.status.configDir
    };
    this.emitSyntheticEvent("backend.starting", { command: launch.command });

    this.child = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      env: {
        ...process.env,
        TERMIRA_LOG_DIR: this.status.logDir,
        TERMIRA_CONFIG_DIR: this.status.configDir
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.status.pid = this.child.pid;

    const stdout = readline.createInterface({ input: this.child.stdout });
    stdout.on("line", (line) => this.handleStdout(line));

    const stderr = readline.createInterface({ input: this.child.stderr });
    stderr.on("line", (line) => {
      if (line.trim().length > 0) {
        console.warn(`[termira-backend] ${line}`);
      }
    });

    this.child.on("error", (error) => {
      this.status = {
        ...this.status,
        state: "error",
        lastError: error.message
      };
      this.rejectAll(error);
      this.emitSyntheticEvent("backend.error", { message: error.message });
    });

    this.child.on("exit", (code, signal) => {
      this.child = null;
      this.status = {
        ...this.status,
        state: "offline",
        pid: undefined,
        exitedAt: new Date().toISOString(),
        exitCode: code,
        signal
      };
      this.rejectAll(new Error("Backend sidecar exited."));
      this.emitSyntheticEvent("backend.exited", { code, signal });
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) {
      return;
    }

    const exited = new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    });

    try {
      await this.invoke("app.shutdown", {}, 2_000);
    } catch {
      child.kill();
    }

    await Promise.race([
      exited,
      new Promise<void>((resolve) => {
        setTimeout(() => {
          if (!child.killed) {
            child.kill();
          }
          resolve();
        }, 2_000);
      })
    ]);
  }

  async invoke(method: string, params: unknown, timeoutMs = 10_000): Promise<unknown> {
    if (!this.child || !this.child.stdin.writable) {
      throw new Error("Backend sidecar is offline.");
    }

    const id = `req_${Date.now()}_${++this.sequence}`;
    const request = {
      id,
      type: "request",
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Backend request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      this.child?.stdin.write(`${JSON.stringify(request)}\n`, "utf8", (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  private handleStdout(line: string): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }

    if (!trimmed.startsWith("{")) {
      console.warn(`[termira-backend:stdout] ${trimmed}`);
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      const parseError = error instanceof Error ? error.message : "Unknown parse error";
      this.status = { ...this.status, state: "error", lastError: parseError };
      this.emitSyntheticEvent("backend.error", { message: parseError });
      return;
    }

    if (this.isResponse(message)) {
      this.handleResponse(message);
      return;
    }

    if (this.isEvent(message)) {
      this.handleEvent(message);
    }
  }

  private handleResponse(response: IpcResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(response.id);

    if (response.ok) {
      pending.resolve(response.result);
    } else {
      const error = new Error(response.error.message);
      error.name = response.error.code;
      pending.reject(error);
    }
  }

  private handleEvent(event: IpcEvent): void {
    if (event.event === "backend.ready") {
      const payload = event.payload as Partial<{
        protocolVersion: string;
        backendVersion: string;
      }>;
      this.status = {
        ...this.status,
        state: payload.protocolVersion === PROTOCOL_VERSION ? "online" : "error",
        protocolVersion: payload.protocolVersion,
        backendVersion: payload.backendVersion,
        lastError:
          payload.protocolVersion === PROTOCOL_VERSION
            ? undefined
            : `Unsupported backend protocol: ${payload.protocolVersion ?? "unknown"}`
      };

      if (this.status.state === "online") {
        void this.invoke("app.getVersion", {}, 5_000)
          .then((version) => {
            const result = version as Partial<{
              protocolVersion: string;
              backendVersion: string;
            }>;
            this.status = {
              ...this.status,
              protocolVersion: result.protocolVersion,
              backendVersion: result.backendVersion
            };
          })
          .catch((error) => {
            this.status = {
              ...this.status,
              state: "error",
              lastError: error instanceof Error ? error.message : String(error)
            };
          });
      }
    }

    this.emit(event);
  }

  private resolveLaunchCommand(): { command: string; args: string[]; cwd: string } {
    if (app.isPackaged) {
      const jarPath = path.join(process.resourcesPath, "backend-java", "termira-backend.jar");
      return {
        command: "java",
        args: ["-jar", jarPath],
        cwd: process.resourcesPath
      };
    }

    const desktopRoot = app.getAppPath();
    const repoRoot = path.resolve(desktopRoot, "../..");
    const pomPath = path.join(repoRoot, "apps/backend-java/pom.xml");
    const mavenRepo = path.join(repoRoot, ".m2/repository");

    return {
      command: "mvn",
      args: [
        "-q",
        "-Dstyle.color=never",
        `-Dmaven.repo.local=${mavenRepo}`,
        "-f",
        pomPath,
        "exec:java",
        `-Dtermira.log.dir=${this.status.logDir}`
      ],
      cwd: repoRoot
    };
  }

  private resolveLogDir(): string {
    if (app?.isReady()) {
      return path.join(app.getPath("userData"), "logs");
    }

    return path.join(os.homedir(), "Library", "Application Support", "Termira", "logs");
  }

  private resolveConfigDir(): string {
    if (app?.isReady()) {
      return app.getPath("userData");
    }

    return path.join(os.homedir(), "Library", "Application Support", "Termira");
  }

  private emitSyntheticEvent(event: string, payload: unknown): void {
    this.emit({
      type: "event",
      event,
      eventId: `evt_${Date.now()}_${++this.sequence}`,
      timestamp: new Date().toISOString(),
      payload
    });
  }

  private emit(event: IpcEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private isResponse(message: unknown): message is IpcResponse {
    return (
      typeof message === "object" &&
      message !== null &&
      (message as { type?: unknown }).type === "response" &&
      typeof (message as { id?: unknown }).id === "string"
    );
  }

  private isEvent(message: unknown): message is IpcEvent {
    return (
      typeof message === "object" &&
      message !== null &&
      (message as { type?: unknown }).type === "event" &&
      typeof (message as { event?: unknown }).event === "string"
    );
  }
}
