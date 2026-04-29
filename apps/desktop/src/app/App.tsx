import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Command,
  Copy,
  Cpu,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Gauge,
  HardDrive,
  KeyRound,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Network,
  Play,
  Plus,
  Power,
  RefreshCcw,
  Search,
  Server,
  Settings,
  Square,
  Star,
  Terminal,
  Upload,
  Wifi,
  WifiOff,
  X,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BackendStatus, PingResult } from "@termira/shared";
import {
  DEFAULT_LANGUAGE,
  getMessages,
  isAppLanguage,
  LANGUAGE_OPTIONS,
  type AppLanguage,
  type AppMessages
} from "../i18n/messages";
import { formatBackendState, getBackendStateTone } from "../utils/backendStatus";

type TimelineEntry = {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
};

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

type TerminalSession = {
  id: string;
  hostId: string;
  title: LocalizedText;
  cwd: string;
  status: ConnectionState;
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

const initialStatus: BackendStatus = {
  state: "starting",
  logDir: ""
};

const browserPreviewBridge: Window["termira"] = {
  async invoke<TResult = unknown>(method: string): Promise<TResult> {
    if (method === "app.getBackendStatus") {
      return {
        state: "offline",
        logDir: "renderer preview",
        lastError: "Electron preload is not attached in browser preview."
      } satisfies BackendStatus as TResult;
    }

    if (method === "app.ping") {
      return {
        protocolVersion: "preview",
        backendVersion: "preview",
        message: "pong",
        timestamp: new Date().toISOString()
      } satisfies PingResult as TResult;
    }

    return { accepted: true } as TResult;
  },
  on() {
    return undefined;
  },
  off() {
    return undefined;
  }
};

const LANGUAGE_STORAGE_KEY = "termira.ui.language";

const hosts: HostItem[] = [
  {
    id: "prod-api-01",
    name: { "zh-CN": "生产 API 01", "en-US": "Production API 01" },
    group: { "zh-CN": "生产环境", "en-US": "Production" },
    host: "10.0.8.12",
    user: "ubuntu",
    identity: "termira-prod.pem",
    port: 22,
    remotePath: "/srv/termira/api/current/releases/2026-04-29/logs",
    note: { "zh-CN": "核心业务 API，默认打开日志目录。", "en-US": "Core API, opens logs by default." },
    lastConnected: { "zh-CN": "今天 10:18", "en-US": "Today 10:18" },
    tags: [
      { "zh-CN": "常用", "en-US": "Pinned" },
      { "zh-CN": "跳板机", "en-US": "Bastion" }
    ],
    favorite: true,
    recent: true,
    status: "connected"
  },
  {
    id: "staging-web",
    name: { "zh-CN": "预发 Web", "en-US": "Staging Web" },
    group: { "zh-CN": "预发环境", "en-US": "Staging" },
    host: "172.16.4.20",
    user: "deploy",
    identity: "termira-staging",
    port: 22,
    remotePath: "/var/www/termira-preview/current",
    note: { "zh-CN": "预发布站点与灰度验证。", "en-US": "Preview site and canary checks." },
    lastConnected: { "zh-CN": "昨天 18:42", "en-US": "Yesterday 18:42" },
    tags: [{ "zh-CN": "Web", "en-US": "Web" }],
    favorite: true,
    recent: true,
    status: "connecting"
  },
  {
    id: "dev-box",
    name: { "zh-CN": "开发机", "en-US": "Dev Box" },
    group: { "zh-CN": "个人服务器", "en-US": "Personal" },
    host: "192.168.31.56",
    user: "df",
    identity: "id_ed25519",
    port: 22,
    remotePath: "/Users/df/workspace/termira",
    note: { "zh-CN": "本地开发与构建缓存。", "en-US": "Local development and build cache." },
    lastConnected: { "zh-CN": "周一 09:06", "en-US": "Mon 09:06" },
    tags: [{ "zh-CN": "本地", "en-US": "Local" }],
    favorite: false,
    recent: true,
    status: "disconnected"
  },
  {
    id: "ops-long-name",
    name: {
      "zh-CN": "日志归档与链路追踪节点-上海三区-超长主机名回归样例",
      "en-US": "Log Archive and Tracing Node Shanghai Zone Three Long Name Regression"
    },
    group: { "zh-CN": "运维工具", "en-US": "Operations" },
    host: "10.88.120.205",
    user: "observability",
    identity: "ops-observability-ed25519",
    port: 22022,
    remotePath:
      "/data/observability/archive/2026/04/29/service-with-a-very-long-path-for-layout-regression/current",
    note: { "zh-CN": "用于验证长主机名、长路径和标签截断。", "en-US": "Validates long host, path, and tag truncation." },
    lastConnected: { "zh-CN": "上周五 22:14", "en-US": "Last Fri 22:14" },
    tags: [
      { "zh-CN": "观测", "en-US": "Observability" },
      { "zh-CN": "长名称", "en-US": "Long name" }
    ],
    favorite: false,
    recent: false,
    status: "failed"
  }
];

const toolDefinitions: ToolDefinition[] = [
  { id: "files", label: { "zh-CN": "文件", "en-US": "Files" }, icon: FolderOpen },
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
  const termiraBridge = useMemo(() => window.termira ?? browserPreviewBridge, []);
  const [language, setLanguage] = useState<AppLanguage>(() => {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isAppLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  });
  const [status, setStatus] = useState<BackendStatus>(initialStatus);
  const [activeView, setActiveView] = useState<ActiveView>("hosts");
  const [activeTool, setActiveTool] = useState<ToolPanelId>("files");
  const [hostSearch, setHostSearch] = useState("");
  const [processSearch, setProcessSearch] = useState("");
  const [selectedHostId, setSelectedHostId] = useState(hosts[0].id);
  const [activeTerminalTabId, setActiveTerminalTabId] = useState("tab-current");
  const [lastPing, setLastPing] = useState<PingResult | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

  const text = getMessages(language);
  const statusTone = getBackendStateTone(status.state);
  const isOnline = status.state === "online";

  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? hosts[0];
  const terminalTabs = useMemo<TerminalSession[]>(
    () => [
      {
        id: "tab-current",
        hostId: selectedHost.id,
        title: selectedHost.name,
        cwd: selectedHost.remotePath,
        status: selectedHost.status
      },
      {
        id: "tab-staging",
        hostId: "staging-web",
        title: { "zh-CN": "预发 Web · 日志", "en-US": "Staging Web · Logs" },
        cwd: "/var/www/termira-preview/current/logs",
        status: "connecting"
      },
      {
        id: "tab-long",
        hostId: "ops-long-name",
        title: {
          "zh-CN": "链路追踪超长标签 /data/observability/archive/current",
          "en-US": "Tracing long tab /data/observability/archive/current"
        },
        cwd: "/data/observability/archive/2026/04/29/service-with-a-very-long-path-for-layout-regression/current",
        status: "failed"
      }
    ],
    [selectedHost]
  );
  const activeTerminal = terminalTabs.find((tab) => tab.id === activeTerminalTabId) ?? terminalTabs[0];
  const activeTerminalHost = hosts.find((host) => host.id === activeTerminal.hostId) ?? selectedHost;
  const activeToolDefinition = toolDefinitions.find((tool) => tool.id === activeTool) ?? toolDefinitions[0];

  const favoriteHosts = useMemo(() => hosts.filter((host) => host.favorite), []);
  const recentHosts = useMemo(() => hosts.filter((host) => host.recent), []);
  const visibleHosts = useMemo(() => filterHosts(hosts, hostSearch, language), [hostSearch, language]);
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

  const versionText = useMemo(() => {
    if (!status.protocolVersion && !status.backendVersion) {
      return text.backend.protocolPending;
    }

    return text.backend.versionText(status.protocolVersion ?? "-", status.backendVersion ?? "-");
  }, [status.backendVersion, status.protocolVersion, text]);

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    void refreshStatus();

    const handleLifecycleEvent = (payload: unknown, event: string) => {
      appendTimeline(event, summarizePayload(payload, text));
      void refreshStatus();
    };

    termiraBridge.on("backend.ready", handleLifecycleEvent);
    termiraBridge.on("backend.exited", handleLifecycleEvent);
    termiraBridge.on("backend.error", handleLifecycleEvent);
    termiraBridge.on("backend.starting", handleLifecycleEvent);

    return () => {
      termiraBridge.off("backend.ready", handleLifecycleEvent);
      termiraBridge.off("backend.exited", handleLifecycleEvent);
      termiraBridge.off("backend.error", handleLifecycleEvent);
      termiraBridge.off("backend.starting", handleLifecycleEvent);
    };
  }, [termiraBridge, text]);

  async function refreshStatus() {
    const nextStatus = await termiraBridge.invoke<BackendStatus>("app.getBackendStatus");
    setStatus(nextStatus);
  }

  async function pingBackend() {
    setBusyAction("ping");
    try {
      const result = await termiraBridge.invoke<PingResult>("app.ping");
      setLastPing(result);
      appendTimeline("app.ping", result.message);
      await refreshStatus();
    } catch (error) {
      appendTimeline("app.ping.failed", error instanceof Error ? error.message : String(error));
      await refreshStatus();
    } finally {
      setBusyAction(null);
    }
  }

  async function stopBackend() {
    setBusyAction("stop");
    try {
      await termiraBridge.invoke("app.shutdown");
      appendTimeline("app.shutdown", text.timeline.accepted);
    } catch (error) {
      appendTimeline("app.shutdown.failed", error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
      await refreshStatus();
    }
  }

  async function restartBackend() {
    setBusyAction("restart");
    try {
      await termiraBridge.invoke("app.restartBackend");
      appendTimeline("app.restartBackend", text.timeline.starting);
    } catch (error) {
      appendTimeline("app.restartBackend.failed", error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
      await refreshStatus();
    }
  }

  function appendTimeline(label: string, detail: string) {
    const timestamp = new Date().toISOString();
    setTimeline((current) => [
      {
        id: `${timestamp}_${label}`,
        label,
        detail,
        timestamp
      },
      ...current
    ].slice(0, 8));
  }

  function selectHost(hostId: string) {
    setSelectedHostId(hostId);
    setActiveTerminalTabId("tab-current");
    setActiveView("hosts");
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

  return (
    <main className="app-shell">
      <aside className="rail" aria-label={text.navigation.workspace}>
        <div className="brand-mark">
          <Terminal size={22} aria-hidden="true" />
        </div>
        <button
          className={`rail-button ${activeView === "hosts" ? "is-active" : ""}`}
          type="button"
          title={text.navigation.hosts}
          aria-label={text.navigation.hosts}
          onClick={() => setActiveView("hosts")}
        >
          <Server size={18} aria-hidden="true" />
        </button>
        <button
          className={`rail-button ${activeView === "settings" ? "is-active" : ""}`}
          type="button"
          title={text.navigation.settings}
          aria-label={text.navigation.settings}
          onClick={() => setActiveView("settings")}
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </aside>

      <aside className="navigator">
        {activeView === "hosts" ? (
          <>
            <div className="navigator-heading">
              <p className="eyebrow">Termira</p>
              <h2>{text.hosts.sidebarTitle}</h2>
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

            <button className="button button--accent navigator-action" type="button">
              <Plus size={16} aria-hidden="true" />
              <span>{text.hosts.newHost}</span>
            </button>

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
          </>
        ) : (
          <>
            <div className="navigator-heading">
              <p className="eyebrow">Termira</p>
              <h2>{text.settings.sidebarTitle}</h2>
            </div>
            <nav className="settings-nav" aria-label={text.settings.sidebarTitle}>
              <a href="#preferences">{text.settings.preferences}</a>
              <a href="#runtime">{text.settings.runtime}</a>
            </nav>
          </>
        )}
      </aside>

      <section className="workspace">
        {activeView === "hosts" ? (
          <section className="workspace-view">
            <header className="workspace-header">
              <div className="workspace-title">
                <p className="eyebrow">{text.hosts.workspaceEyebrow}</p>
                <h1>{translate(selectedHost.name, language)}</h1>
                <p>{translate(selectedHost.note, language)}</p>
              </div>
              <div className="header-actions">
                <button className="button" type="button" disabled title={text.hosts.disconnect}>
                  <Square size={16} aria-hidden="true" />
                  <span>{text.hosts.disconnect}</span>
                </button>
                <button className="button button--accent" type="button">
                  <Terminal size={16} aria-hidden="true" />
                  <span>{text.hosts.connect}</span>
                </button>
              </div>
            </header>

            <section className="workbench-grid">
              <div className="terminal-column">
                <section className="terminal-stage" aria-label={text.terminal.title}>
                  <div className="terminal-tabs">
                    {terminalTabs.map((tab) => (
                      <button
                        key={tab.id}
                        className={activeTerminal.id === tab.id ? "is-active" : undefined}
                        type="button"
                        title={translate(tab.title, language)}
                        onClick={() => setActiveTerminalTabId(tab.id)}
                      >
                        <span className={`tab-status tab-status--${hostStatusTone[tab.status]}`} />
                        <span>{translate(tab.title, language)}</span>
                        {tab.id !== "tab-current" ? <X size={13} aria-hidden="true" /> : null}
                      </button>
                    ))}
                    <button type="button" title={text.terminal.newTab} aria-label={text.terminal.newTab}>
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="terminal-pane">
                    <div className="terminal-toolbar">
                      <span title={formatHostAddress(activeTerminalHost)}>{formatHostAddress(activeTerminalHost)}</span>
                      <div className="terminal-toolbar-actions">
                        <span>{text.terminal.mockBadge}</span>
                        <button type="button" title={text.actions.copy} aria-label={text.actions.copy}>
                          <Copy size={14} aria-hidden="true" />
                        </button>
                        <button type="button" title={text.actions.maximize} aria-label={text.actions.maximize}>
                          <Maximize2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <pre>
                      {[
                        `$ ssh -p ${activeTerminalHost.port} ${formatHostAddress(activeTerminalHost)}`,
                        text.terminal.connected(translate(activeTerminalHost.name, language)),
                        `${activeTerminalHost.user}@${activeTerminalHost.host}:${activeTerminal.cwd}$ systemctl status termira-api`,
                        "● termira-api.service - Termira API Service",
                        "   Active: active (running) since Wed 2026-04-29 09:20:12 CST",
                        `${activeTerminalHost.user}@${activeTerminalHost.host}:${activeTerminal.cwd}$ tail -f application.log`,
                        "10:18:42 INFO request_id=7f01 latency=42ms route=/api/health",
                        activeTerminal.status === "failed" ? text.terminal.errorLine : text.terminal.ready,
                        text.terminal.cursor
                      ].join("\n")}
                    </pre>
                  </div>
                </section>

                <section className="session-strip" aria-label={text.hosts.sessionTitle}>
                  <div>
                    <span>{text.hosts.address}</span>
                    <strong title={formatHostAddress(selectedHost)}>{formatHostAddress(selectedHost)}</strong>
                  </div>
                  <div>
                    <span>{text.hosts.group}</span>
                    <strong>{translate(selectedHost.group, language)}</strong>
                  </div>
                  <div>
                    <span>{text.hosts.currentPath}</span>
                    <strong title={selectedHost.remotePath}>{selectedHost.remotePath}</strong>
                  </div>
                  <div>
                    <span>{text.hosts.auth}</span>
                    <strong>{selectedHost.identity}</strong>
                  </div>
                </section>
              </div>

              <aside className="tool-dock" aria-label={text.tools.title}>
                <div className="tool-dock-tabs" role="tablist" aria-label={text.tools.title}>
                  {toolDefinitions.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <button
                        key={tool.id}
                        className={activeTool === tool.id ? "is-active" : undefined}
                        type="button"
                        role="tab"
                        aria-selected={activeTool === tool.id}
                        title={translate(tool.label, language)}
                        onClick={() => setActiveTool(tool.id)}
                      >
                        <Icon size={15} aria-hidden="true" />
                        <span>{translate(tool.label, language)}</span>
                      </button>
                    );
                  })}
                </div>

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
              </aside>
            </section>
          </section>
        ) : (
          <section className="settings-grid">
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

            <div className="workspace-panel" id="runtime">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{text.backend.eyebrow}</p>
                  <h2>{text.settings.runtime}</h2>
                </div>
                <div className={`status-pill status-pill--${statusTone}`}>
                  {isOnline ? <Wifi size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
                  <span>{formatBackendState(status.state, language)}</span>
                </div>
              </div>

              <dl className="metric-grid">
                <div>
                  <dt>{text.backend.process}</dt>
                  <dd>{status.pid ? `PID ${status.pid}` : text.backend.notRunning}</dd>
                </div>
                <div>
                  <dt>{text.backend.version}</dt>
                  <dd>{versionText}</dd>
                </div>
                <div>
                  <dt>{text.backend.lastPing}</dt>
                  <dd>{lastPing?.timestamp ?? text.backend.noPing}</dd>
                </div>
                <div>
                  <dt>{text.backend.logs}</dt>
                  <dd className="path-text">{status.logDir || text.backend.pending}</dd>
                </div>
              </dl>

              {status.lastError ? <p className="inline-error">{status.lastError}</p> : null}

              <div className="action-row">
                <button
                  className="button button--accent"
                  type="button"
                  onClick={pingBackend}
                  disabled={!isOnline || busyAction !== null}
                >
                  <Activity size={16} aria-hidden="true" />
                  <span>{busyAction === "ping" ? text.actions.pinging : text.actions.ping}</span>
                </button>
                <button className="button" type="button" onClick={restartBackend} disabled={busyAction !== null}>
                  <RefreshCcw size={16} aria-hidden="true" />
                  <span>{busyAction === "restart" ? text.actions.restarting : text.actions.restart}</span>
                </button>
                <button
                  className="button button--danger"
                  type="button"
                  onClick={stopBackend}
                  disabled={!isOnline || busyAction !== null}
                >
                  <Power size={16} aria-hidden="true" />
                  <span>{busyAction === "stop" ? text.actions.stopping : text.actions.stop}</span>
                </button>
              </div>
            </div>

            <div className="workspace-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{text.timeline.eyebrow}</p>
                  <h2>{text.timeline.title}</h2>
                </div>
              </div>
              <ol className="timeline">
                {timeline.length > 0 ? (
                  timeline.map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.label}</span>
                      <strong>{entry.detail}</strong>
                      <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleTimeString()}</time>
                    </li>
                  ))
                ) : (
                  <li className="empty-row">
                    <span>{text.timeline.waiting}</span>
                    <strong>{text.timeline.empty}</strong>
                    <time>-</time>
                  </li>
                )}
              </ol>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function translate(value: LocalizedText, language: AppLanguage): string {
  return value[language];
}

function formatHostAddress(host: HostItem): string {
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

function summarizePayload(payload: unknown, text: AppMessages): string {
  if (!payload || typeof payload !== "object") {
    return payload === undefined ? text.timeline.received : String(payload);
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.message === "string") {
    return record.message;
  }

  if ("code" in record || "signal" in record) {
    return `code=${String(record.code ?? "-")} signal=${String(record.signal ?? "-")}`;
  }

  if (typeof record.backendVersion === "string") {
    return text.timeline.backendVersion(record.backendVersion);
  }

  if (record.accepted === true) {
    return text.timeline.accepted;
  }

  return text.timeline.received;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
