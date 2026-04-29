import type { LucideIcon } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTermTerminal, type IDisposable } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Command,
  Cpu,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Gauge,
  HardDrive,
  KeyRound,
  Loader2,
  Lock,
  Maximize2,
  MoreHorizontal,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Palette,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Star,
  Terminal,
  Unlock,
  Upload,
  X,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_LANGUAGE,
  getMessages,
  isAppLanguage,
  LANGUAGE_OPTIONS,
  type AppLanguage
} from "../i18n/messages";
import type { FormEvent } from "react";

type ActiveView = "hosts" | "settings";
type ToolPanelId = "files" | "forwards" | "monitor" | "processes" | "commands";
type ConnectionState = "connected" | "connecting" | "disconnected" | "failed" | "timeout";
type StatusTone = "good" | "warn" | "bad" | "muted";
type LocalizedText = Record<AppLanguage, string>;

type HostItem = {
  id: string;
  name: LocalizedText;
  group: LocalizedText;
  host: string;
  user: string;
  identity: string;
  port: number;
  remotePath: string;
  note: LocalizedText;
  lastConnected: LocalizedText;
  tags: LocalizedText[];
  favorite: boolean;
  recent: boolean;
  status: ConnectionState;
};

type BackendHostProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  groupId?: string;
  groupName?: string;
  tags: string[];
  note?: string;
  auth: {
    type: "password" | "privateKey" | "keyboardInteractive";
    credentialRef?: string;
    privateKeyPath?: string;
    saveCredential: boolean;
  };
  defaultRemotePath?: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
};

type VaultStatus = {
  initialized: boolean;
  locked: boolean;
  mode?: "local-key" | "master-password";
  schemaVersion: number;
  credentialCount: number;
  kdfName?: string;
  cipherName?: string;
  vaultPath?: string;
};

type HostFormState = {
  name: string;
  host: string;
  port: string;
  username: string;
  groupName: string;
  tags: string;
  note: string;
  defaultRemotePath: string;
  authType: "password" | "privateKey" | "keyboardInteractive";
  privateKeyPath: string;
  saveCredential: boolean;
  password: string;
  passphrase: string;
  favorite: boolean;
};

type TerminalSession = {
  id: string;
  hostId: string;
  title: LocalizedText;
  cwd: string;
  status: ConnectionState;
  sessionId?: string;
  channelId?: string;
  error?: string;
};

type SshSessionView = {
  sessionId: string;
  profileId?: string;
  host: string;
  port: number;
  username: string;
  status: "CREATED" | "CONNECTING" | "AUTHENTICATING" | "CONNECTED" | "DISCONNECTING" | "DISCONNECTED" | "FAILED";
  errorCode?: string;
  errorMessage?: string;
};

type TerminalOpenResult = {
  sessionId: string;
  channelId: string;
  cols: number;
  rows: number;
};

type TerminalOutputPayload = {
  sessionId: string;
  channelId: string;
  data: string;
  stream?: "stdout" | "stderr";
};

type TerminalClosedPayload = {
  sessionId: string;
  channelId: string;
};

type XTermEntry = {
  terminal: XTermTerminal;
  fitAddon: FitAddon;
  inputDisposable: IDisposable;
};

type ToolDefinition = {
  id: ToolPanelId;
  label: LocalizedText;
  icon: LucideIcon;
};

type FileEntry = {
  id: string;
  name: string;
  kind: "directory" | "file";
  size: string;
  modified: string;
  permissions: string;
};

type TransferEntry = {
  id: string;
  name: string;
  direction: "upload" | "download";
  progress: number;
  status: "running" | "failed" | "queued";
  detail: LocalizedText;
};

type ForwardRule = {
  id: string;
  name: LocalizedText;
  type: "local" | "remote" | "dynamic";
  listen: string;
  target: string;
  status: "running" | "starting" | "failed" | "stopped";
  detail: LocalizedText;
};

type MonitorMetric = {
  id: string;
  label: LocalizedText;
  value: string;
  helper: LocalizedText;
  percent: number;
  tone: StatusTone;
};

type ProcessEntry = {
  pid: number;
  user: string;
  cpu: string;
  memory: string;
  command: string;
  status: "healthy" | "hot" | "system";
};

type QuickCommand = {
  id: string;
  name: LocalizedText;
  group: LocalizedText;
  command: string;
  note: LocalizedText;
  disabled?: boolean;
};

const LANGUAGE_STORAGE_KEY = "termira.ui.language";

const defaultHostForm: HostFormState = {
  name: "",
  host: "",
  port: "22",
  username: "",
  groupName: "",
  tags: "",
  note: "",
  defaultRemotePath: "",
  authType: "password",
  privateKeyPath: "",
  saveCredential: false,
  password: "",
  passphrase: "",
  favorite: false
};

const toolDefinitions: ToolDefinition[] = [
  { id: "files", label: { "zh-CN": "SFTP", "en-US": "SFTP" }, icon: FolderOpen },
  { id: "forwards", label: { "zh-CN": "转发", "en-US": "Forwarding" }, icon: Network },
  { id: "monitor", label: { "zh-CN": "监控", "en-US": "Monitor" }, icon: BarChart3 },
  { id: "processes", label: { "zh-CN": "进程", "en-US": "Processes" }, icon: Cpu },
  { id: "commands", label: { "zh-CN": "命令", "en-US": "Commands" }, icon: Command }
];

const fileEntries: FileEntry[] = [
  {
    id: "logs",
    name: "logs",
    kind: "directory",
    size: "-",
    modified: "2026-04-29 10:12",
    permissions: "drwxr-xr-x"
  },
  {
    id: "releases",
    name: "releases",
    kind: "directory",
    size: "-",
    modified: "2026-04-28 23:48",
    permissions: "drwxr-xr-x"
  },
  {
    id: "app-log",
    name: "application-2026-04-29-production-api-request-with-extra-long-name.log",
    kind: "file",
    size: "128.4 MB",
    modified: "2026-04-29 10:21",
    permissions: "-rw-r-----"
  },
  {
    id: "env",
    name: ".env.production",
    kind: "file",
    size: "4.8 KB",
    modified: "2026-04-29 09:55",
    permissions: "-rw-------"
  }
];

const transferEntries: TransferEntry[] = [
  {
    id: "upload-config",
    name: "nginx-site.conf",
    direction: "upload",
    progress: 68,
    status: "running",
    detail: { "zh-CN": "上传中 1.8 MB/s", "en-US": "Uploading 1.8 MB/s" }
  },
  {
    id: "download-log",
    name: "application-2026-04-29.log",
    direction: "download",
    progress: 100,
    status: "queued",
    detail: { "zh-CN": "等待校验", "en-US": "Waiting for checksum" }
  },
  {
    id: "secure-log",
    name: "/var/log/secure",
    direction: "download",
    progress: 18,
    status: "failed",
    detail: { "zh-CN": "权限不足，可重试", "en-US": "Permission denied, retry available" }
  }
];

const forwardRules: ForwardRule[] = [
  {
    id: "local-admin",
    name: { "zh-CN": "本地访问管理后台", "en-US": "Local admin console" },
    type: "local",
    listen: "127.0.0.1:18080",
    target: "10.0.8.12:8080",
    status: "running",
    detail: { "zh-CN": "已转发 36 分钟", "en-US": "Forwarding for 36 min" }
  },
  {
    id: "remote-hook",
    name: { "zh-CN": "远程回调调试", "en-US": "Remote webhook debug" },
    type: "remote",
    listen: "0.0.0.0:19090",
    target: "127.0.0.1:9090",
    status: "starting",
    detail: { "zh-CN": "正在请求远端监听", "en-US": "Requesting remote bind" }
  },
  {
    id: "socks-dynamic",
    name: { "zh-CN": "动态 SOCKS 代理", "en-US": "Dynamic SOCKS proxy" },
    type: "dynamic",
    listen: "127.0.0.1:1086",
    target: "-",
    status: "stopped",
    detail: { "zh-CN": "手动启动", "en-US": "Manual start" }
  },
  {
    id: "occupied",
    name: { "zh-CN": "本地 5432 数据库", "en-US": "Local 5432 database" },
    type: "local",
    listen: "127.0.0.1:5432",
    target: "10.0.8.15:5432",
    status: "failed",
    detail: { "zh-CN": "端口已被占用", "en-US": "Port already in use" }
  }
];

const monitorMetrics: MonitorMetric[] = [
  {
    id: "cpu",
    label: { "zh-CN": "CPU", "en-US": "CPU" },
    value: "42%",
    helper: { "zh-CN": "8 核 / load 1.82", "en-US": "8 cores / load 1.82" },
    percent: 42,
    tone: "good"
  },
  {
    id: "memory",
    label: { "zh-CN": "内存", "en-US": "Memory" },
    value: "71%",
    helper: { "zh-CN": "11.4 / 16 GB", "en-US": "11.4 / 16 GB" },
    percent: 71,
    tone: "warn"
  },
  {
    id: "disk",
    label: { "zh-CN": "磁盘", "en-US": "Disk" },
    value: "63%",
    helper: { "zh-CN": "/data 318 GB 可用", "en-US": "/data 318 GB free" },
    percent: 63,
    tone: "good"
  },
  {
    id: "network",
    label: { "zh-CN": "网络", "en-US": "Network" },
    value: "18 MB/s",
    helper: { "zh-CN": "入 12.1 / 出 5.9", "en-US": "In 12.1 / out 5.9" },
    percent: 36,
    tone: "muted"
  }
];

const processEntries: ProcessEntry[] = [
  { pid: 1842, user: "termira", cpu: "36.8", memory: "512M", command: "java -jar termira-api.jar", status: "hot" },
  { pid: 2206, user: "nginx", cpu: "8.2", memory: "96M", command: "nginx: worker process", status: "healthy" },
  { pid: 3090, user: "postgres", cpu: "4.1", memory: "1.2G", command: "postgres: writer process", status: "system" },
  { pid: 6118, user: "deploy", cpu: "1.4", memory: "42M", command: "tail -f /srv/termira/api/current/logs/application.log", status: "healthy" }
];

const quickCommands: QuickCommand[] = [
  {
    id: "journal",
    name: { "zh-CN": "查看服务日志", "en-US": "View service logs" },
    group: { "zh-CN": "排障", "en-US": "Troubleshooting" },
    command: "journalctl -u termira-api -f --since '30 minutes ago'",
    note: { "zh-CN": "发送到当前终端", "en-US": "Send to active terminal" }
  },
  {
    id: "disk",
    name: { "zh-CN": "磁盘占用 Top 20", "en-US": "Disk usage top 20" },
    group: { "zh-CN": "巡检", "en-US": "Inspection" },
    command: "du -ah /srv/termira | sort -rh | head -20",
    note: { "zh-CN": "只读命令", "en-US": "Read-only command" }
  },
  {
    id: "restart",
    name: { "zh-CN": "重启 API 服务", "en-US": "Restart API service" },
    group: { "zh-CN": "维护", "en-US": "Maintenance" },
    command: "sudo systemctl restart termira-api",
    note: { "zh-CN": "需要连接后启用", "en-US": "Enabled after connection" },
    disabled: true
  }
];

const hostStatusTone: Record<ConnectionState, StatusTone> = {
  connected: "good",
  connecting: "warn",
  disconnected: "muted",
  failed: "bad",
  timeout: "bad"
};

export function App() {
  const [language, setLanguage] = useState<AppLanguage>(() => {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isAppLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  });
  const [activeView, setActiveView] = useState<ActiveView>("hosts");
  const [activeTool, setActiveTool] = useState<ToolPanelId>("files");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isToolDockCollapsed, setIsToolDockCollapsed] = useState(false);
  const [hostSearch, setHostSearch] = useState("");
  const [processSearch, setProcessSearch] = useState("");
  const [selectedHostId, setSelectedHostId] = useState("");
  const [activeTerminalTabId, setActiveTerminalTabId] = useState("tab-preview");
  const [terminalTabs, setTerminalTabs] = useState<TerminalSession[]>([]);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [hostProfiles, setHostProfiles] = useState<BackendHostProfile[]>([]);
  const [isHostLoading, setIsHostLoading] = useState(true);
  const [hostError, setHostError] = useState<string | null>(null);
  const [isHostEditorOpen, setIsHostEditorOpen] = useState(false);
  const [hostForm, setHostForm] = useState<HostFormState>(defaultHostForm);
  const [isSavingHost, setIsSavingHost] = useState(false);
  const [hostFormError, setHostFormError] = useState<string | null>(null);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultMasterPassword, setVaultMasterPassword] = useState("");
  const [isVaultBusy, setIsVaultBusy] = useState(false);

  const text = getMessages(language);
  const terminalTabsRef = useRef<TerminalSession[]>([]);
  const xtermEntriesRef = useRef<Map<string, XTermEntry>>(new Map());
  const pendingTerminalOutputRef = useRef<Map<string, string[]>>(new Map());
  const resizeTimersRef = useRef<Map<string, number>>(new Map());
  const hostStatusById = useMemo(() => buildHostStatusMap(terminalTabs), [terminalTabs]);
  const hosts = useMemo(() => hostProfiles.map((profile) => profileToHostItem(profile, hostStatusById.get(profile.id))), [hostProfiles, hostStatusById]);
  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? hosts[0] ?? createPlaceholderHost(language);
  const previewTerminalTab = useMemo<TerminalSession>(
    () => ({
      id: "tab-preview",
      hostId: selectedHost.id,
      title: selectedHost.name,
      cwd: selectedHost.remotePath,
      status: selectedHost.status
    }),
    [selectedHost]
  );
  const visibleTerminalTabs = terminalTabs.length > 0 ? terminalTabs : [previewTerminalTab];
  const activeTerminal = visibleTerminalTabs.find((tab) => tab.id === activeTerminalTabId) ?? visibleTerminalTabs[0] ?? previewTerminalTab;
  const activeTerminalHost = hosts.find((host) => host.id === activeTerminal.hostId) ?? selectedHost;
  const activeToolDefinition = toolDefinitions.find((tool) => tool.id === activeTool) ?? toolDefinitions[0];

  const favoriteHosts = useMemo(() => hosts.filter((host) => host.favorite), [hosts]);
  const recentHosts = useMemo(() => hosts.filter((host) => host.recent), [hosts]);
  const visibleHosts = useMemo(() => filterHosts(hosts, hostSearch, language), [hosts, hostSearch, language]);
  const visibleFavoriteHosts = useMemo(
    () => filterHosts(favoriteHosts, hostSearch, language),
    [favoriteHosts, hostSearch, language]
  );
  const visibleRecentHosts = useMemo(() => filterHosts(recentHosts, hostSearch, language), [recentHosts, hostSearch, language]);
  const visibleProcesses = useMemo(() => {
    const query = processSearch.trim().toLocaleLowerCase();
    if (!query) {
      return processEntries;
    }

    return processEntries.filter((process) =>
      [process.pid, process.user, process.cpu, process.memory, process.command]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    );
  }, [processSearch]);

  const fitAndResizeTerminal = useCallback((tabId: string) => {
    const entry = xtermEntriesRef.current.get(tabId);
    if (!entry) {
      return;
    }

    entry.fitAddon.fit();
    const tab = terminalTabsRef.current.find((item) => item.id === tabId);
    if (!tab?.sessionId || !tab.channelId) {
      return;
    }

    const existingTimer = resizeTimersRef.current.get(tabId);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    const timer = window.setTimeout(() => {
      resizeTimersRef.current.delete(tabId);
      void window.termira
        .invoke("terminal.resize", {
          sessionId: tab.sessionId,
          channelId: tab.channelId,
          cols: entry.terminal.cols,
          rows: entry.terminal.rows
        })
        .catch((error) => setTerminalError(errorMessage(error)));
    }, 120);
    resizeTimersRef.current.set(tabId, timer);
  }, []);

  const disposeTerminal = useCallback((tabId: string) => {
    const timer = resizeTimersRef.current.get(tabId);
    if (timer) {
      window.clearTimeout(timer);
      resizeTimersRef.current.delete(tabId);
    }
    const entry = xtermEntriesRef.current.get(tabId);
    if (entry) {
      entry.inputDisposable.dispose();
      entry.terminal.dispose();
      xtermEntriesRef.current.delete(tabId);
    }
    pendingTerminalOutputRef.current.delete(tabId);
  }, []);

  const mountTerminal = useCallback(
    (tabId: string, node: HTMLDivElement | null) => {
      if (!node || xtermEntriesRef.current.has(tabId)) {
        return;
      }

      const terminal = new XTermTerminal({
        allowProposedApi: false,
        cursorBlink: true,
        convertEol: true,
        fontFamily: "SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace",
        fontSize: 13,
        lineHeight: 1.35,
        scrollback: 3000,
        theme: {
          background: "#080b0d",
          foreground: "#d5f8ee",
          cursor: "#42c5ad",
          selectionBackground: "#214d47"
        }
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      const inputDisposable = terminal.onData((data) => {
        const tab = terminalTabsRef.current.find((item) => item.id === tabId);
        if (!tab?.sessionId || !tab.channelId || tab.status !== "connected") {
          return;
        }
        void window.termira
          .invoke("terminal.write", {
            sessionId: tab.sessionId,
            channelId: tab.channelId,
            data
          })
          .catch((error) => setTerminalError(errorMessage(error)));
      });

      terminal.open(node);
      xtermEntriesRef.current.set(tabId, { terminal, fitAddon, inputDisposable });
      fitAndResizeTerminal(tabId);
      for (const data of pendingTerminalOutputRef.current.get(tabId) ?? []) {
        terminal.write(data);
      }
      pendingTerminalOutputRef.current.delete(tabId);
    },
    [fitAndResizeTerminal]
  );

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    terminalTabsRef.current = terminalTabs;
  }, [terminalTabs]);

  useEffect(() => {
    void refreshProfiles();
    void refreshVaultStatus();
  }, []);

  useEffect(() => {
    if (!selectedHostId && hosts.length > 0) {
      setSelectedHostId(hosts[0].id);
    }
    if (selectedHostId && hosts.length > 0 && !hosts.some((host) => host.id === selectedHostId)) {
      setSelectedHostId(hosts[0].id);
    }
  }, [hosts, selectedHostId]);

  useEffect(() => {
    if (terminalTabs.length > 0 && !terminalTabs.some((tab) => tab.id === activeTerminalTabId)) {
      setActiveTerminalTabId(terminalTabs[0].id);
    }
    if (terminalTabs.length === 0 && activeTerminalTabId !== "tab-preview") {
      setActiveTerminalTabId("tab-preview");
    }
  }, [activeTerminalTabId, terminalTabs]);

  useEffect(() => {
    const onOutput = (payload: unknown) => {
      const output = payload as Partial<TerminalOutputPayload>;
      if (typeof output.sessionId !== "string" || typeof output.channelId !== "string" || typeof output.data !== "string") {
        return;
      }

      const tab = terminalTabsRef.current.find(
        (item) => item.channelId === output.channelId || item.sessionId === output.sessionId
      );
      if (!tab) {
        return;
      }

      const entry = xtermEntriesRef.current.get(tab.id);
      if (entry) {
        entry.terminal.write(output.data);
        return;
      }

      const pending = pendingTerminalOutputRef.current.get(tab.id) ?? [];
      pending.push(output.data);
      pendingTerminalOutputRef.current.set(tab.id, pending.slice(-200));
    };

    const onTerminalClosed = (payload: unknown) => {
      const closed = payload as Partial<TerminalClosedPayload>;
      if (typeof closed.channelId !== "string") {
        return;
      }
      setTerminalTabs((current) =>
        current.map((tab) =>
          tab.channelId === closed.channelId
            ? {
                ...tab,
                status: "disconnected"
              }
            : tab
        )
      );
    };

    const onSshStatus = (payload: unknown) => {
      const status = payload as Partial<SshSessionView>;
      if (typeof status.sessionId !== "string" || typeof status.status !== "string") {
        return;
      }
      const connectionState = sshStatusToConnectionState(status.status as SshSessionView["status"]);
      setTerminalTabs((current) =>
        current.map((tab) =>
          tab.sessionId === status.sessionId
            ? {
                ...tab,
                status: connectionState,
                error: status.errorMessage
              }
            : tab
        )
      );
    };

    window.termira.on("terminal.output", onOutput);
    window.termira.on("terminal.closed", onTerminalClosed);
    window.termira.on("ssh.statusChanged", onSshStatus);

    return () => {
      window.termira.off("terminal.output", onOutput);
      window.termira.off("terminal.closed", onTerminalClosed);
      window.termira.off("ssh.statusChanged", onSshStatus);
    };
  }, []);

  useEffect(() => {
    const resizeActiveTerminal = () => {
      if (activeTerminal.id !== "tab-preview") {
        fitAndResizeTerminal(activeTerminal.id);
      }
    };
    window.addEventListener("resize", resizeActiveTerminal);
    resizeActiveTerminal();

    return () => window.removeEventListener("resize", resizeActiveTerminal);
  }, [activeTerminal.id, fitAndResizeTerminal, isSidebarCollapsed, isToolDockCollapsed]);

  useEffect(
    () => () => {
      for (const tabId of xtermEntriesRef.current.keys()) {
        disposeTerminal(tabId);
      }
    },
    []
  );

  async function refreshProfiles() {
    setIsHostLoading(true);
    setHostError(null);
    try {
      const profiles = await window.termira.invoke<BackendHostProfile[]>("profile.list", {});
      setHostProfiles(profiles);
    } catch (error) {
      setHostError(errorMessage(error));
    } finally {
      setIsHostLoading(false);
    }
  }

  async function refreshVaultStatus() {
    setVaultError(null);
    try {
      const status = await window.termira.invoke<VaultStatus>("vault.status", {});
      setVaultStatus(status);
    } catch (error) {
      setVaultError(errorMessage(error));
    }
  }

  async function saveHost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingHost(true);
    setHostFormError(null);

    try {
      const port = Number.parseInt(hostForm.port, 10);
      if (!hostForm.name.trim() || !hostForm.host.trim() || !hostForm.username.trim() || !Number.isInteger(port)) {
        throw new Error(text.hostEditor.validation);
      }

      let credentialRef: string | undefined;
      const shouldSaveCredential =
        hostForm.saveCredential &&
        (hostForm.password.trim().length > 0 || hostForm.passphrase.trim().length > 0);

      if (shouldSaveCredential) {
        let status = vaultStatus ?? (await window.termira.invoke<VaultStatus>("vault.status", {}));
        if (!status.initialized) {
          status = await window.termira.invoke<VaultStatus>("vault.init", { mode: "local-key" });
        }
        if (status.locked) {
          throw new Error(text.hostEditor.vaultLocked);
        }
        const credential = await window.termira.invoke<{ credentialId: string }>("credential.save", {
          type: hostForm.authType,
          password: hostForm.authType === "privateKey" ? undefined : hostForm.password,
          passphrase: hostForm.authType === "privateKey" ? hostForm.passphrase : undefined,
          privateKeyContent: undefined
        });
        credentialRef = credential.credentialId;
        setVaultStatus(status);
      }

      await window.termira.invoke<BackendHostProfile>("profile.create", {
        name: hostForm.name.trim(),
        host: hostForm.host.trim(),
        port,
        username: hostForm.username.trim(),
        groupName: hostForm.groupName.trim() || undefined,
        tags: splitTags(hostForm.tags),
        note: hostForm.note.trim() || undefined,
        defaultRemotePath: hostForm.defaultRemotePath.trim() || undefined,
        favorite: hostForm.favorite,
        auth: {
          type: hostForm.authType,
          credentialRef,
          privateKeyPath: hostForm.authType === "privateKey" ? hostForm.privateKeyPath.trim() || undefined : undefined,
          saveCredential: Boolean(credentialRef)
        }
      });

      setHostForm(defaultHostForm);
      setIsHostEditorOpen(false);
      await refreshProfiles();
      await refreshVaultStatus();
    } catch (error) {
      setHostFormError(errorMessage(error));
    } finally {
      setIsSavingHost(false);
    }
  }

  async function initLocalVault() {
    await runVaultAction(() => window.termira.invoke<VaultStatus>("vault.init", { mode: "local-key" }));
  }

  async function initMasterVault() {
    await runVaultAction(() =>
      window.termira.invoke<VaultStatus>("vault.init", {
        mode: "master-password",
        masterPassword: vaultMasterPassword
      })
    );
    setVaultMasterPassword("");
  }

  async function unlockVault() {
    await runVaultAction(() => window.termira.invoke<VaultStatus>("vault.unlock", { masterPassword: vaultMasterPassword }));
    setVaultMasterPassword("");
  }

  async function lockVault() {
    await runVaultAction(() => window.termira.invoke<VaultStatus>("vault.lock", {}));
  }

  async function runVaultAction(action: () => Promise<VaultStatus>) {
    setIsVaultBusy(true);
    setVaultError(null);
    try {
      const status = await action();
      setVaultStatus(status);
    } catch (error) {
      setVaultError(errorMessage(error));
    } finally {
      setIsVaultBusy(false);
    }
  }

  function setHostFormField<Field extends keyof HostFormState>(field: Field, value: HostFormState[Field]) {
    setHostForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function selectHost(hostId: string) {
    setSelectedHostId(hostId);
    setActiveView("hosts");
  }

  function closeTerminalTab(tabId: string) {
    const tab = terminalTabs.find((item) => item.id === tabId);
    if (tab?.sessionId && tab.channelId) {
      void window.termira.invoke("terminal.close", { sessionId: tab.sessionId, channelId: tab.channelId }).catch(() => undefined);
    }
    if (tab?.sessionId) {
      void window.termira.invoke("ssh.disconnect", { sessionId: tab.sessionId }).catch(() => undefined);
    }
    disposeTerminal(tabId);

    const nextTabs = terminalTabs.filter((item) => item.id !== tabId);
    setTerminalTabs(nextTabs);
    if (activeTerminalTabId === tabId) {
      setActiveTerminalTabId(nextTabs[0]?.id ?? "tab-preview");
    }
  }

  async function openTerminalForHost(host: HostItem, existingTabId?: string) {
    if (host.id === "__placeholder" || host.status === "connecting") {
      return;
    }

    const tabId = existingTabId && existingTabId !== "tab-preview" ? existingTabId : `tab_${Date.now()}`;
    const nextTab: TerminalSession = {
      id: tabId,
      hostId: host.id,
      title: host.name,
      cwd: host.remotePath,
      status: "connecting"
    };

    setTerminalError(null);
    pendingTerminalOutputRef.current.set(tabId, [`$ ssh -p ${host.port} ${formatHostAddress(host)}\r\n`]);
    setTerminalTabs((current) => {
      const rest = current.filter((tab) => tab.id !== tabId);
      return [...rest, nextTab];
    });
    setActiveTerminalTabId(tabId);

    const entry = xtermEntriesRef.current.get(tabId);
    entry?.terminal.reset();
    if (entry) {
      pendingTerminalOutputRef.current.delete(tabId);
      entry.terminal.write(`$ ssh -p ${host.port} ${formatHostAddress(host)}\r\n`);
    }

    try {
      const session = await window.termira.invoke<SshSessionView>("ssh.connect", { profileId: host.id });
      const dimensions = terminalDimensions(tabId, xtermEntriesRef.current);
      const shell = await window.termira.invoke<TerminalOpenResult>("terminal.openShell", {
        sessionId: session.sessionId,
        cols: dimensions.cols,
        rows: dimensions.rows,
        term: "xterm-256color"
      });

      setTerminalTabs((current) =>
        current.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                sessionId: session.sessionId,
                channelId: shell.channelId,
                status: "connected",
                error: undefined
              }
            : tab
        )
      );
      fitAndResizeTerminal(tabId);
    } catch (error) {
      const message = errorMessage(error);
      setTerminalError(message);
      setTerminalTabs((current) =>
        current.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                status: "failed",
                error: message
              }
            : tab
        )
      );
      xtermEntriesRef.current.get(tabId)?.terminal.writeln(`\r\n${message}`);
    }
  }

  async function connectActiveTerminal() {
    await openTerminalForHost(activeTerminalHost, activeTerminal.id);
  }

  async function openNewTerminalTab() {
    await openTerminalForHost(selectedHost);
  }

  async function disconnectActiveTerminal() {
    if (!activeTerminal.sessionId) {
      return;
    }
    setTerminalError(null);
    setTerminalTabs((current) =>
      current.map((tab) =>
        tab.id === activeTerminal.id
          ? {
              ...tab,
              status: "disconnected"
            }
          : tab
      )
    );
    try {
      if (activeTerminal.channelId) {
        await window.termira.invoke("terminal.close", {
          sessionId: activeTerminal.sessionId,
          channelId: activeTerminal.channelId
        });
      }
      await window.termira.invoke("ssh.disconnect", { sessionId: activeTerminal.sessionId });
    } catch (error) {
      setTerminalError(errorMessage(error));
    }
  }

  function renderHostRows(items: HostItem[], emptyText: string) {
    if (items.length === 0) {
      return <p className="empty-copy">{emptyText}</p>;
    }

    return items.map((host) => {
      const address = formatHostAddress(host);
      const tone = hostStatusTone[host.status];

      return (
        <button
          key={host.id}
          className={`host-row ${selectedHost.id === host.id ? "is-active" : ""}`}
          type="button"
          onClick={() => selectHost(host.id)}
        >
          <span className={`host-row-icon host-row-icon--${tone}`}>
            <Server size={15} aria-hidden="true" />
          </span>
          <span className="host-row-copy">
            <strong title={translate(host.name, language)}>{translate(host.name, language)}</strong>
            <small title={address}>{address}</small>
          </span>
          <span className={`host-row-status host-row-status--${tone}`} title={text.hosts.statusLabels[host.status]}>
            {text.hosts.statusLabels[host.status]}
          </span>
        </button>
      );
    });
  }

  function renderFilesPanel() {
    return (
      <div className="tool-content">
        <div className="tool-path" title={selectedHost.remotePath}>
          <FolderOpen size={16} aria-hidden="true" />
          <span>{selectedHost.remotePath}</span>
        </div>

        <div className="icon-toolbar" aria-label={text.tools.files.toolbar}>
          <button type="button" title={text.actions.refresh} aria-label={text.actions.refresh}>
            <RefreshCcw size={15} aria-hidden="true" />
          </button>
          <button type="button" title={text.tools.files.upload} aria-label={text.tools.files.upload}>
            <Upload size={15} aria-hidden="true" />
          </button>
          <button type="button" title={text.tools.files.download} aria-label={text.tools.files.download}>
            <Download size={15} aria-hidden="true" />
          </button>
          <button type="button" disabled title={text.tools.files.moreDisabled} aria-label={text.tools.files.moreDisabled}>
            <MoreHorizontal size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="file-table" role="table" aria-label={text.tools.files.list}>
          <div className="file-row file-row--head" role="row">
            <span>{text.tools.files.name}</span>
            <span>{text.tools.files.size}</span>
            <span>{text.tools.files.modified}</span>
          </div>
          {fileEntries.map((entry) => (
            <button key={entry.id} className="file-row" type="button" role="row">
              <span className="file-name" title={entry.name}>
                {entry.kind === "directory" ? <Folder size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}
                <span>{entry.name}</span>
              </span>
              <span>{entry.size}</span>
              <span>{entry.modified}</span>
            </button>
          ))}
        </div>

        <div className="subpanel">
          <div className="subpanel-heading">
            <strong>{text.tools.files.queue}</strong>
            <span>{text.tools.files.queueCount(transferEntries.length)}</span>
          </div>
          <div className="queue-list">
            {transferEntries.map((entry) => (
              <div key={entry.id} className={`queue-item queue-item--${entry.status}`}>
                <div className="queue-main">
                  {entry.direction === "upload" ? <Upload size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
                  <span title={entry.name}>{entry.name}</span>
                  <strong>{translate(entry.detail, language)}</strong>
                </div>
                <div className="progress-track" aria-label={`${entry.progress}%`}>
                  <span style={{ width: `${entry.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderForwardsPanel() {
    return (
      <div className="tool-content">
        <div className="split-actions">
          <button className="button button--compact button--accent" type="button">
            <Plus size={15} aria-hidden="true" />
            <span>{text.tools.forwards.newRule}</span>
          </button>
          <button className="button button--compact" type="button">
            <RefreshCcw size={15} aria-hidden="true" />
            <span>{text.actions.refresh}</span>
          </button>
        </div>

        <div className="rule-list">
          {forwardRules.map((rule) => (
            <div key={rule.id} className={`rule-card rule-card--${rule.status}`}>
              <div className="rule-card-head">
                <div>
                  <strong title={translate(rule.name, language)}>{translate(rule.name, language)}</strong>
                  <span>{text.tools.forwards.typeLabels[rule.type]}</span>
                </div>
                <span className={`state-badge state-badge--${getForwardTone(rule.status)}`}>
                  {rule.status === "starting" ? <Loader2 size={13} aria-hidden="true" /> : null}
                  {text.tools.forwards.statusLabels[rule.status]}
                </span>
              </div>
              <div className="rule-route">
                <code>{rule.listen}</code>
                <span>→</span>
                <code>{rule.target}</code>
              </div>
              <div className="rule-card-foot">
                <span>{translate(rule.detail, language)}</span>
                <button
                  className="icon-button"
                  type="button"
                  disabled={rule.status === "starting"}
                  title={rule.status === "running" ? text.actions.stop : text.actions.start}
                  aria-label={rule.status === "running" ? text.actions.stop : text.actions.start}
                >
                  {rule.status === "running" ? <Square size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderMonitorPanel() {
    return (
      <div className="tool-content">
        <div className="monitor-summary">
          <div>
            <Gauge size={18} aria-hidden="true" />
            <span>{text.tools.monitor.uptime}</span>
            <strong>18d 04h</strong>
          </div>
          <div>
            <HardDrive size={18} aria-hidden="true" />
            <span>{text.tools.monitor.refresh}</span>
            <strong>{text.tools.monitor.refreshing}</strong>
          </div>
        </div>

        <div className="metric-stack">
          {monitorMetrics.map((metric) => (
            <div key={metric.id} className={`metric-card metric-card--${metric.tone}`}>
              <div className="metric-card-head">
                <span>{translate(metric.label, language)}</span>
                <strong>{metric.value}</strong>
              </div>
              <div className="progress-track" aria-label={`${metric.percent}%`}>
                <span style={{ width: `${metric.percent}%` }} />
              </div>
              <small>{translate(metric.helper, language)}</small>
            </div>
          ))}
        </div>

        <div className="inline-state inline-state--error">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{text.tools.monitor.partialError}</span>
        </div>
      </div>
    );
  }

  function renderProcessesPanel() {
    return (
      <div className="tool-content">
        <label className="search-box search-box--compact">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={processSearch}
            placeholder={text.tools.processes.searchPlaceholder}
            onChange={(event) => setProcessSearch(event.target.value)}
          />
        </label>

        <div className="process-table" role="table" aria-label={text.tools.processes.title}>
          <div className="process-row process-row--head" role="row">
            <span>PID</span>
            <span>CPU</span>
            <span>MEM</span>
            <span>{text.tools.processes.command}</span>
          </div>
          {visibleProcesses.map((process) => (
            <div key={process.pid} className={`process-row process-row--${process.status}`} role="row">
              <span>{process.pid}</span>
              <span>{process.cpu}%</span>
              <span>{process.memory}</span>
              <span title={process.command}>{process.command}</span>
              <button
                className="icon-button"
                type="button"
                disabled={process.status === "system"}
                title={text.tools.processes.kill}
                aria-label={text.tools.processes.kill}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        <div className="inline-state">
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>{text.tools.processes.loaded(visibleProcesses.length)}</span>
        </div>
      </div>
    );
  }

  function renderCommandsPanel() {
    return (
      <div className="tool-content">
        <div className="split-actions">
          <button className="button button--compact button--accent" type="button">
            <Plus size={15} aria-hidden="true" />
            <span>{text.tools.commands.newCommand}</span>
          </button>
          <button className="button button--compact" type="button">
            <Folder size={15} aria-hidden="true" />
            <span>{text.tools.commands.groups}</span>
          </button>
        </div>

        <div className="command-list">
          {quickCommands.map((command) => (
            <article key={command.id} className="command-card">
              <div className="command-card-head">
                <div>
                  <span>{translate(command.group, language)}</span>
                  <strong>{translate(command.name, language)}</strong>
                </div>
                <button
                  className="button button--compact"
                  type="button"
                  disabled={command.disabled}
                  title={text.tools.commands.send}
                >
                  <Zap size={14} aria-hidden="true" />
                  <span>{text.tools.commands.send}</span>
                </button>
              </div>
              <code title={command.command}>{command.command}</code>
              <small>{translate(command.note, language)}</small>
            </article>
          ))}
        </div>
      </div>
    );
  }

  function renderActiveToolPanel() {
    switch (activeTool) {
      case "files":
        return renderFilesPanel();
      case "forwards":
        return renderForwardsPanel();
      case "monitor":
        return renderMonitorPanel();
      case "processes":
        return renderProcessesPanel();
      case "commands":
        return renderCommandsPanel();
      default:
        return assertNever(activeTool);
    }
  }

  function renderToolSideRail() {
    return (
      <div className="tool-side-rail" aria-label={text.tools.title}>
        <button
          className="icon-button"
          type="button"
          title={isToolDockCollapsed ? text.tools.expandPanel : text.tools.collapsePanel}
          aria-label={isToolDockCollapsed ? text.tools.expandPanel : text.tools.collapsePanel}
          onClick={() => setIsToolDockCollapsed((current) => !current)}
        >
          {isToolDockCollapsed ? <PanelRightOpen size={15} aria-hidden="true" /> : <PanelRightClose size={15} aria-hidden="true" />}
        </button>
        {toolDefinitions.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              className={`icon-button ${activeTool === tool.id ? "is-active" : ""}`}
              type="button"
              title={translate(tool.label, language)}
              aria-label={translate(tool.label, language)}
              onClick={() => {
                setActiveTool(tool.id);
                setIsToolDockCollapsed(false);
              }}
            >
              <Icon size={15} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <main
      className={`app-shell ${activeView === "settings" ? "is-settings-view" : ""} ${
        isSidebarCollapsed ? "is-nav-collapsed" : ""
      }`}
    >
      <aside className="app-rail" aria-label={text.navigation.workspace}>
        <button
          className="rail-brand"
          type="button"
          title={text.navigation.hosts}
          aria-label={text.navigation.hosts}
          onClick={() => {
            setActiveView("hosts");
            setIsSidebarCollapsed(false);
          }}
        >
          <Terminal size={20} aria-hidden="true" />
        </button>

        <nav className="rail-nav" aria-label={text.navigation.workspace}>
          <button
            className={activeView === "hosts" ? "is-active" : undefined}
            type="button"
            title={text.navigation.hosts}
            aria-label={text.navigation.hosts}
            onClick={() => {
              setActiveView("hosts");
              setIsSidebarCollapsed(false);
            }}
          >
            <Server size={18} aria-hidden="true" />
          </button>
          <button
            className={activeView === "settings" ? "is-active" : undefined}
            type="button"
            title={text.navigation.settings}
            aria-label={text.navigation.settings}
            onClick={() => setActiveView("settings")}
          >
            <Settings size={18} aria-hidden="true" />
          </button>
        </nav>
      </aside>

      {activeView === "hosts" && !isSidebarCollapsed ? (
        <aside className="navigator">
        <div className="navigator-top">
          <div className="brand-lockup">
            <span className="brand-mark-small">
              <Terminal size={18} aria-hidden="true" />
            </span>
            <div>
              <strong>Termira</strong>
              <small>{text.hosts.sidebarTitle}</small>
            </div>
          </div>
          <button
            className="nav-collapse-button"
            type="button"
            title={text.navigation.collapseSidebar}
            aria-label={text.navigation.collapseSidebar}
            onClick={() => setIsSidebarCollapsed((current) => !current)}
          >
            <PanelLeftClose size={16} aria-hidden="true" />
          </button>
        </div>

            <label className="search-box">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={hostSearch}
                placeholder={text.hosts.searchPlaceholder}
                onChange={(event) => setHostSearch(event.target.value)}
              />
            </label>

            <button
              className="button button--accent navigator-action"
              type="button"
              onClick={() => {
                setHostForm(defaultHostForm);
                setHostFormError(null);
                setIsHostEditorOpen(true);
              }}
            >
              <Plus size={16} aria-hidden="true" />
              <span>{text.hosts.newHost}</span>
            </button>

            {isHostLoading ? (
              <div className="inline-state">
                <Loader2 className="spin-icon" size={15} aria-hidden="true" />
                <span>{text.hosts.loading}</span>
              </div>
            ) : null}
            {hostError ? (
              <div className="inline-state inline-state--error">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>{hostError}</span>
              </div>
            ) : null}

            <nav className="host-sections" aria-label={text.hosts.sidebarTitle}>
              <section className="host-section">
                <div className="section-title">
                  <Star size={14} aria-hidden="true" />
                  <span>{text.hosts.favorites}</span>
                </div>
                {renderHostRows(visibleFavoriteHosts, text.hosts.empty)}
              </section>

              <section className="host-section">
                <div className="section-title">
                  <Clock size={14} aria-hidden="true" />
                  <span>{text.hosts.recent}</span>
                </div>
                {renderHostRows(visibleRecentHosts, text.hosts.empty)}
              </section>

              <section className="host-section">
                <div className="section-title">
                  <Folder size={14} aria-hidden="true" />
                  <span>{text.hosts.allHosts}</span>
                </div>
                {renderHostRows(visibleHosts, text.hosts.empty)}
              </section>
            </nav>
        </aside>
      ) : null}

      <section className="workspace">
        {activeView === "hosts" ? (
          <section className="workspace-view">
            <section className={`workbench-grid ${isToolDockCollapsed ? "is-tool-collapsed" : ""}`}>
              <div className="terminal-column">
                <section className="terminal-stage" aria-label={text.terminal.title}>
                  <div className="terminal-tabs">
                    {visibleTerminalTabs.map((tab) => (
                      <div
                        key={tab.id}
                        className={`terminal-tab ${activeTerminal.id === tab.id ? "is-active" : ""}`}
                        title={translate(tab.title, language)}
                      >
                        <button className="terminal-tab-main" type="button" title={translate(tab.title, language)} onClick={() => setActiveTerminalTabId(tab.id)}>
                          <Terminal size={14} aria-hidden="true" />
                          <span>{translate(tab.title, language)}</span>
                        </button>
                        <button
                          className="tab-close"
                          type="button"
                          title={text.terminal.closeTab}
                          aria-label={text.terminal.closeTab}
                          disabled={tab.id === "tab-preview"}
                          onClick={(event) => {
                            event.stopPropagation();
                            closeTerminalTab(tab.id);
                          }}
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    <button
                      className="terminal-tab terminal-tab--add"
                      type="button"
                      title={text.terminal.newTab}
                      aria-label={text.terminal.newTab}
                      onClick={openNewTerminalTab}
                      disabled={selectedHost.id === "__placeholder" || selectedHost.status === "connecting"}
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="terminal-pane">
                    <div className="terminal-toolbar">
                      <span title={formatHostAddress(activeTerminalHost)}>{formatHostAddress(activeTerminalHost)}</span>
                      <div className="terminal-toolbar-actions">
                        <span>{text.terminal.mockBadge}</span>
                        <span className={`state-badge state-badge--${hostStatusTone[activeTerminal.status]}`}>
                          {text.hosts.statusLabels[activeTerminal.status]}
                        </span>
                        <button
                          type="button"
                          title={text.hosts.connect}
                          aria-label={text.hosts.connect}
                          disabled={activeTerminal.status === "connecting" || activeTerminal.status === "connected" || activeTerminalHost.id === "__placeholder"}
                          onClick={connectActiveTerminal}
                        >
                          {activeTerminal.status === "connecting" ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                        </button>
                        <button
                          type="button"
                          title={text.hosts.disconnect}
                          aria-label={text.hosts.disconnect}
                          disabled={!activeTerminal.sessionId || activeTerminal.status === "disconnected"}
                          onClick={disconnectActiveTerminal}
                        >
                          <Square size={14} aria-hidden="true" />
                        </button>
                        <button type="button" title={text.actions.maximize} aria-label={text.actions.maximize}>
                          <Maximize2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="terminal-surface-stack">
                      {terminalTabs.length > 0 ? (
                        terminalTabs.map((tab) => (
                          <div
                            key={tab.id}
                            className={`terminal-surface ${activeTerminal.id === tab.id ? "is-active" : ""}`}
                            ref={(node) => mountTerminal(tab.id, node)}
                          />
                        ))
                      ) : (
                        <div className="terminal-empty">
                          <Terminal size={28} aria-hidden="true" />
                          <span>{text.terminal.ready}</span>
                        </div>
                      )}
                    </div>
                    {terminalError || activeTerminal.error ? (
                      <div className="terminal-status-line">
                        <AlertTriangle size={14} aria-hidden="true" />
                        <span>{terminalError ?? activeTerminal.error}</span>
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>

              <aside className={`tool-dock ${isToolDockCollapsed ? "is-collapsed" : ""}`} aria-label={text.tools.title}>
                {isToolDockCollapsed ? (
                  renderToolSideRail()
                ) : (
                  <>
                    {renderToolSideRail()}
                    <div className="tool-panel">
                      <div className="tool-panel-heading">
                        <div>
                          <p className="eyebrow">{text.tools.eyebrow}</p>
                          <h2>{translate(activeToolDefinition.label, language)}</h2>
                        </div>
                        <span className={`state-badge state-badge--${hostStatusTone[selectedHost.status]}`}>
                          {text.hosts.statusLabels[selectedHost.status]}
                        </span>
                      </div>

                      {renderActiveToolPanel()}
                    </div>
                  </>
                )}
              </aside>
            </section>
          </section>
        ) : (
          <section className="settings-shell">
            <aside className="settings-sidebar" aria-label={text.settings.sidebarTitle}>
              <div className="settings-sidebar-head">
                <strong>{text.settings.sidebarTitle}</strong>
                <span>{text.settings.preferences}</span>
              </div>
              <nav>
                <a className="is-active" href="#preferences">
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  <span>{text.settings.general}</span>
                </a>
                <a href="#appearance">
                  <Palette size={16} aria-hidden="true" />
                  <span>{text.settings.appearance}</span>
                </a>
                <a href="#security">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <span>{text.settings.security}</span>
                </a>
              </nav>
            </aside>

            <section className="settings-content">
              <div className="workspace-panel" id="preferences">
                <div className="panel-heading">
                <div>
                  <p className="eyebrow">{text.settings.eyebrow}</p>
                  <h2>{text.settings.title}</h2>
                </div>
                </div>

                <div className="setting-row">
                <div>
                  <span>{text.settings.currentLanguage}</span>
                  <p>{text.settings.description}</p>
                </div>
                  <div className="language-switch" aria-label={text.language.label}>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={option.value === language ? "is-active" : undefined}
                      type="button"
                      title={option.title}
                      onClick={() => setLanguage(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                  </div>
                </div>
              </div>

              <div className="workspace-panel" id="security">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{text.settings.security}</p>
                    <h2>{text.vault.title}</h2>
                  </div>
                  <span className={`state-badge state-badge--${vaultStatus?.locked ? "warn" : vaultStatus?.initialized ? "good" : "muted"}`}>
                    {vaultStatus?.initialized
                      ? vaultStatus.locked
                        ? text.vault.locked
                        : text.vault.unlocked
                      : text.vault.notInitialized}
                  </span>
                </div>

                <div className="vault-grid">
                  <div className="vault-summary">
                    <KeyRound size={18} aria-hidden="true" />
                    <div>
                      <span>{text.vault.mode}</span>
                      <strong>{formatVaultMode(vaultStatus, text)}</strong>
                    </div>
                    <div>
                      <span>{text.vault.credentialCount}</span>
                      <strong>{vaultStatus?.credentialCount ?? 0}</strong>
                    </div>
                    <div>
                      <span>{text.vault.cipher}</span>
                      <strong>{vaultStatus?.cipherName ?? "-"}</strong>
                    </div>
                  </div>

                  <div className="vault-actions">
                    <button className="button button--compact" type="button" disabled={isVaultBusy} onClick={initLocalVault}>
                      <KeyRound size={14} aria-hidden="true" />
                      <span>{text.vault.initLocal}</span>
                    </button>
                    <label className="form-field form-field--inline">
                      <span>{text.vault.masterPassword}</span>
                      <input
                        type="password"
                        value={vaultMasterPassword}
                        onChange={(event) => setVaultMasterPassword(event.target.value)}
                      />
                    </label>
                    <button className="button button--compact" type="button" disabled={isVaultBusy} onClick={initMasterVault}>
                      <ShieldCheck size={14} aria-hidden="true" />
                      <span>{text.vault.initMaster}</span>
                    </button>
                    <button className="button button--compact" type="button" disabled={isVaultBusy} onClick={unlockVault}>
                      <Unlock size={14} aria-hidden="true" />
                      <span>{text.vault.unlock}</span>
                    </button>
                    <button className="button button--compact" type="button" disabled={isVaultBusy} onClick={lockVault}>
                      <Lock size={14} aria-hidden="true" />
                      <span>{text.vault.lock}</span>
                    </button>
                  </div>

                  {vaultError ? (
                    <div className="inline-state inline-state--error">
                      <AlertTriangle size={15} aria-hidden="true" />
                      <span>{vaultError}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </section>
        )}
      </section>
      {isHostEditorOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="host-editor" onSubmit={saveHost}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{text.hostEditor.eyebrow}</p>
                <h2>{text.hostEditor.title}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title={text.hostEditor.close}
                aria-label={text.hostEditor.close}
                onClick={() => setIsHostEditorOpen(false)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>

            <div className="host-editor-grid">
              <label className="form-field">
                <span>{text.hostEditor.name}</span>
                <input value={hostForm.name} onChange={(event) => setHostFormField("name", event.target.value)} autoFocus />
              </label>
              <label className="form-field">
                <span>{text.hostEditor.group}</span>
                <input value={hostForm.groupName} onChange={(event) => setHostFormField("groupName", event.target.value)} />
              </label>
              <label className="form-field">
                <span>{text.hostEditor.host}</span>
                <input value={hostForm.host} onChange={(event) => setHostFormField("host", event.target.value)} />
              </label>
              <label className="form-field">
                <span>{text.hostEditor.port}</span>
                <input inputMode="numeric" value={hostForm.port} onChange={(event) => setHostFormField("port", event.target.value)} />
              </label>
              <label className="form-field">
                <span>{text.hostEditor.username}</span>
                <input value={hostForm.username} onChange={(event) => setHostFormField("username", event.target.value)} />
              </label>
              <label className="form-field">
                <span>{text.hostEditor.path}</span>
                <input
                  value={hostForm.defaultRemotePath}
                  onChange={(event) => setHostFormField("defaultRemotePath", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>{text.hostEditor.tags}</span>
                <input value={hostForm.tags} onChange={(event) => setHostFormField("tags", event.target.value)} />
              </label>
              <label className="form-field">
                <span>{text.hostEditor.privateKeyPath}</span>
                <input
                  value={hostForm.privateKeyPath}
                  disabled={hostForm.authType !== "privateKey"}
                  onChange={(event) => setHostFormField("privateKeyPath", event.target.value)}
                />
              </label>
              <label className="form-field form-field--wide">
                <span>{text.hostEditor.note}</span>
                <input value={hostForm.note} onChange={(event) => setHostFormField("note", event.target.value)} />
              </label>
            </div>

            <div className="segmented-control" aria-label={text.hostEditor.authType}>
              {(["password", "privateKey", "keyboardInteractive"] as const).map((authType) => (
                <button
                  key={authType}
                  className={hostForm.authType === authType ? "is-active" : undefined}
                  type="button"
                  onClick={() => setHostFormField("authType", authType)}
                >
                  {text.hostEditor.authTypes[authType]}
                </button>
              ))}
            </div>

            <div className="host-editor-grid">
              <label className="form-field">
                <span>{text.hostEditor.password}</span>
                <input
                  type="password"
                  value={hostForm.password}
                  disabled={hostForm.authType === "privateKey"}
                  onChange={(event) => setHostFormField("password", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>{text.hostEditor.passphrase}</span>
                <input
                  type="password"
                  value={hostForm.passphrase}
                  disabled={hostForm.authType !== "privateKey"}
                  onChange={(event) => setHostFormField("passphrase", event.target.value)}
                />
              </label>
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={hostForm.saveCredential}
                  onChange={(event) => setHostFormField("saveCredential", event.target.checked)}
                />
                <span>{text.hostEditor.saveCredential}</span>
              </label>
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={hostForm.favorite}
                  onChange={(event) => setHostFormField("favorite", event.target.checked)}
                />
                <span>{text.hostEditor.favorite}</span>
              </label>
            </div>

            {hostFormError ? (
              <div className="inline-state inline-state--error">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>{hostFormError}</span>
              </div>
            ) : null}

            <div className="modal-actions">
              <button className="button" type="button" onClick={() => setIsHostEditorOpen(false)}>
                <span>{text.hostEditor.cancel}</span>
              </button>
              <button className="button button--accent" type="submit" disabled={isSavingHost}>
                {isSavingHost ? <Loader2 className="spin-icon" size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
                <span>{isSavingHost ? text.hostEditor.saving : text.hostEditor.save}</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function translate(value: LocalizedText, language: AppLanguage): string {
  return value[language];
}

function profileToHostItem(profile: BackendHostProfile, status: ConnectionState = "disconnected"): HostItem {
  const groupName = profile.groupName || "未分组";
  const lastConnected = profile.lastConnectedAt ?? "-";
  const identity =
    profile.auth.type === "privateKey"
      ? profile.auth.privateKeyPath || profile.auth.credentialRef || "private key"
      : profile.auth.credentialRef
        ? "vault credential"
        : profile.auth.type;

  return {
    id: profile.id,
    name: toLocalized(profile.name),
    group: toLocalized(groupName),
    host: profile.host,
    user: profile.username,
    identity,
    port: profile.port,
    remotePath: profile.defaultRemotePath || "~",
    note: toLocalized(profile.note || ""),
    lastConnected: toLocalized(lastConnected),
    tags: profile.tags.map(toLocalized),
    favorite: profile.favorite,
    recent: Boolean(profile.lastConnectedAt),
    status
  };
}

function createPlaceholderHost(_language: AppLanguage): HostItem {
  return {
    id: "__placeholder",
    name: { "zh-CN": "未选择主机", "en-US": "No host selected" },
    group: { "zh-CN": "本地配置", "en-US": "Local profiles" },
    host: "0.0.0.0",
    user: "-",
    identity: "-",
    port: 22,
    remotePath: "~",
    note: { "zh-CN": "", "en-US": "" },
    lastConnected: { "zh-CN": "-", "en-US": "-" },
    tags: [],
    favorite: false,
    recent: false,
    status: "disconnected"
  };
}

function toLocalized(value: string): LocalizedText {
  return {
    "zh-CN": value,
    "en-US": value
  };
}

function formatHostAddress(host: HostItem): string {
  if (host.id === "__placeholder") {
    return host.host;
  }
  return `${host.user}@${host.host}`;
}

function filterHosts(items: HostItem[], queryText: string, language: AppLanguage): HostItem[] {
  const query = queryText.trim().toLocaleLowerCase();

  if (!query) {
    return items;
  }

  return items.filter((host) => {
    const searchable = [
      translate(host.name, language),
      translate(host.group, language),
      host.host,
      host.user,
      host.identity,
      host.remotePath,
      host.port,
      ...host.tags.map((tag) => translate(tag, language))
    ]
      .join(" ")
      .toLocaleLowerCase();

    return searchable.includes(query);
  });
}

function getForwardTone(status: ForwardRule["status"]): StatusTone {
  switch (status) {
    case "running":
      return "good";
    case "starting":
      return "warn";
    case "failed":
      return "bad";
    case "stopped":
      return "muted";
    default:
      return assertNever(status);
  }
}

function buildHostStatusMap(tabs: TerminalSession[]): Map<string, ConnectionState> {
  const map = new Map<string, ConnectionState>();
  const priority: Record<ConnectionState, number> = {
    connected: 5,
    connecting: 4,
    failed: 3,
    timeout: 2,
    disconnected: 1
  };

  for (const tab of tabs) {
    const current = map.get(tab.hostId);
    if (!current || priority[tab.status] > priority[current]) {
      map.set(tab.hostId, tab.status);
    }
  }

  return map;
}

function sshStatusToConnectionState(status: SshSessionView["status"]): ConnectionState {
  switch (status) {
    case "CONNECTED":
      return "connected";
    case "CONNECTING":
    case "AUTHENTICATING":
    case "CREATED":
    case "DISCONNECTING":
      return "connecting";
    case "FAILED":
      return "failed";
    case "DISCONNECTED":
      return "disconnected";
    default:
      return "failed";
  }
}

function terminalDimensions(tabId: string, entries: Map<string, XTermEntry>): { cols: number; rows: number } {
  const terminal = entries.get(tabId)?.terminal;
  return {
    cols: terminal?.cols && terminal.cols > 0 ? terminal.cols : 100,
    rows: terminal?.rows && terminal.rows > 0 ? terminal.rows : 30
  };
}

function splitTags(value: string): string[] {
  return value
    .split(/[,\s，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatVaultMode(status: VaultStatus | null, text: ReturnType<typeof getMessages>): string {
  if (!status?.initialized) {
    return text.vault.notInitialized;
  }
  if (status.mode === "master-password") {
    return text.vault.masterMode;
  }
  if (status.mode === "local-key") {
    return text.vault.localMode;
  }
  return "-";
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
