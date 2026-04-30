import type { LucideIcon } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTermTerminal, type IDisposable, type ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Ban,
  Check,
  Command,
  Cpu,
  Download,
  File as FileIcon,
  Folder,
  FolderPlus,
  FolderOpen,
  Gauge,
  KeyRound,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Palette,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Terminal,
  Trash2,
  Unlock,
  Upload,
  X,
  Zap
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DEFAULT_LANGUAGE,
  getMessages,
  isAppLanguage,
  LANGUAGE_OPTIONS,
  type AppLanguage
} from "../i18n/messages";
import type { FormEvent } from "react";

type ActiveView = "hosts" | "terminal" | "settings";
type ToolPanelId = "themes" | "files" | "forwards" | "monitor" | "processes" | "commands";
type ConnectionState = "connected" | "connecting" | "disconnected" | "failed" | "timeout";
type StatusTone = "good" | "warn" | "bad" | "muted";
type LocalizedText = Record<AppLanguage, string>;
type TerminalTabKind = "terminal" | "hostPicker";
type TerminalThemeId = "pro" | "ocean" | "dracula" | "monokai" | "solarized-dark" | "solarized-light" | "red-sands" | "man-page" | "novel";
type TerminalFontId = "source-code-pro" | "sf-mono" | "menlo" | "monaco" | "consolas" | "jetbrains-mono";

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
  kind?: TerminalTabKind;
  hostId: string;
  title: LocalizedText;
  cwd: string;
  status: ConnectionState;
  sessionId?: string;
  channelId?: string;
  error?: string;
};

type TerminalTabMenuState = {
  tabId: string;
  x: number;
  y: number;
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

type SftpOpenResult = {
  sessionId: string;
  path: string;
  version: number;
};

type SftpFileEntry = {
  name: string;
  path: string;
  parentPath: string;
  type: string;
  size: number;
  permissions: string;
  modifiedAt?: string;
  modifiedTime: number;
  directory: boolean;
  regularFile: boolean;
  symlink: boolean;
};

type SftpSortKey = "name" | "modified" | "size" | "permissions";
type SftpSortDirection = "asc" | "desc";
type SftpSortState = {
  key: SftpSortKey;
  direction: SftpSortDirection;
};

type SftpListResult = {
  sessionId: string;
  path: string;
  parentPath: string;
  entries: SftpFileEntry[];
};

type TransferStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

type SftpTransfer = {
  transferId: string;
  sessionId: string;
  direction: "upload" | "download";
  localPath: string;
  remotePath: string;
  fileName: string;
  status: TransferStatus;
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

type ForwardType = "local" | "remote" | "dynamic";
type ForwardStatus = "starting" | "running" | "stopping" | "stopped" | "failed";

type BackendForwardRule = {
  id: string;
  forwardingId: string;
  profileId: string;
  name: string;
  type: ForwardType;
  bindHost: string;
  bindPort: number;
  targetHost?: string;
  targetPort?: number;
  autoStart: boolean;
  status: ForwardStatus;
  sessionId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  statusChangedAt?: string;
};

type ForwardFormState = {
  name: string;
  type: ForwardType;
  bindHost: string;
  bindPort: string;
  targetHost: string;
  targetPort: string;
  autoStart: boolean;
};

type MonitorSnapshot = {
  sessionId: string;
  available: boolean;
  collectedAt: string;
  errorCode?: string;
  errorMessage?: string;
  cpu?: {
    usagePercent: number;
    totalTicks: number;
    idleTicks: number;
  };
  memory?: {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usagePercent: number;
  };
  disk?: {
    path: string;
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usagePercent: number;
  };
  network?: {
    rxBytes: number;
    txBytes: number;
    rxRateBytesPerSecond: number;
    txRateBytesPerSecond: number;
  };
  load?: {
    oneMinute: number;
    fiveMinutes: number;
    fifteenMinutes: number;
  };
  uptimeSeconds?: number;
};

type BackendProcessEntry = {
  pid: number;
  ppid: number;
  user: string;
  cpuPercent: number;
  memoryPercent: number;
  state: string;
  name: string;
  command: string;
};

type ProcessListResult = {
  sessionId: string;
  collectedAt: string;
  processes: BackendProcessEntry[];
};

type ProcessSortKey = "cpu" | "memory" | "pid" | "name";
type ProcessSortDirection = "asc" | "desc";
type ProcessSortState = {
  key: ProcessSortKey;
  direction: ProcessSortDirection;
};

type BackendQuickCommand = {
  id: string;
  profileId?: string;
  groupName?: string;
  name: string;
  command: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

type QuickCommandFormState = {
  name: string;
  groupName: string;
  command: string;
  note: string;
  profileScoped: boolean;
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

type TerminalThemeDefinition = {
  id: TerminalThemeId;
  name: string;
  palette: ITheme;
  preview: {
    background: string;
    foreground: string;
    muted: string;
    accent: string;
    directory: string;
  };
};

type TerminalFontOption = {
  id: TerminalFontId;
  name: string;
  stack: string;
};

const LANGUAGE_STORAGE_KEY = "termira.ui.language";
const HOST_PICKER_HOST_ID = "__host_picker";
const TERMINAL_THEME_STORAGE_KEY = "termira.terminal.theme";
const TERMINAL_FONT_STORAGE_KEY = "termira.terminal.font";
const TERMINAL_FONT_SIZE_STORAGE_KEY = "termira.terminal.fontSize";
const TOOL_DOCK_WIDTH_STORAGE_KEY = "termira.layout.toolDockWidth";
const SFTP_QUEUE_HEIGHT_STORAGE_KEY = "termira.layout.sftpQueueHeight";
const DEFAULT_TERMINAL_FONT_ID: TerminalFontId = "source-code-pro";
const DEFAULT_TERMINAL_FONT_SIZE = 14;
const MIN_TERMINAL_FONT_SIZE = 10;
const MAX_TERMINAL_FONT_SIZE = 24;
const DEFAULT_TOOL_DOCK_WIDTH = 432;
const MIN_TOOL_DOCK_WIDTH = 380;
const MAX_TOOL_DOCK_WIDTH = 760;
const DEFAULT_SFTP_QUEUE_HEIGHT = 168;
const MIN_SFTP_QUEUE_HEIGHT = 88;
const MAX_SFTP_QUEUE_HEIGHT = 380;

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
  saveCredential: true,
  password: "",
  passphrase: "",
  favorite: false
};

const defaultForwardForm: ForwardFormState = {
  name: "",
  type: "local",
  bindHost: "127.0.0.1",
  bindPort: "",
  targetHost: "127.0.0.1",
  targetPort: "",
  autoStart: false
};

const toolDefinitions: ToolDefinition[] = [
  { id: "themes", label: { "zh-CN": "主题", "en-US": "Themes" }, icon: Palette },
  { id: "files", label: { "zh-CN": "SFTP", "en-US": "SFTP" }, icon: FolderOpen },
  { id: "forwards", label: { "zh-CN": "转发", "en-US": "Forwarding" }, icon: Network },
  { id: "monitor", label: { "zh-CN": "监控", "en-US": "Monitor" }, icon: BarChart3 },
  { id: "processes", label: { "zh-CN": "进程", "en-US": "Processes" }, icon: Cpu },
  { id: "commands", label: { "zh-CN": "命令", "en-US": "Commands" }, icon: Command }
];

const defaultQuickCommandForm: QuickCommandFormState = {
  name: "",
  groupName: "",
  command: "",
  note: "",
  profileScoped: false
};

const hostStatusTone: Record<ConnectionState, StatusTone> = {
  connected: "good",
  connecting: "warn",
  disconnected: "muted",
  failed: "bad",
  timeout: "bad"
};

const forwardStatusTone: Record<ForwardStatus, StatusTone> = {
  running: "good",
  starting: "warn",
  stopping: "warn",
  stopped: "muted",
  failed: "bad"
};

const terminalThemes: TerminalThemeDefinition[] = [
  {
    id: "pro",
    name: "Pro",
    palette: {
      background: "#000000",
      foreground: "#f5f5f5",
      cursor: "#f2f2f2",
      selectionBackground: "#333333",
      black: "#000000",
      red: "#ef4444",
      green: "#32d74b",
      yellow: "#facc15",
      blue: "#0066ff",
      magenta: "#ff5fd2",
      cyan: "#22d3ee",
      white: "#d7d7d7",
      brightBlack: "#666666",
      brightRed: "#ff6b6b",
      brightGreen: "#63e66d",
      brightYellow: "#fff176",
      brightBlue: "#4d8dff",
      brightMagenta: "#ff8add",
      brightCyan: "#67e8f9",
      brightWhite: "#ffffff"
    },
    preview: {
      background: "#000000",
      foreground: "#f5f5f5",
      muted: "#9ca3af",
      accent: "#32d74b",
      directory: "#0066ff"
    }
  },
  {
    id: "ocean",
    name: "Ocean",
    palette: {
      background: "#102a55",
      foreground: "#eef6ff",
      cursor: "#eaf2ff",
      selectionBackground: "#2f67bf",
      black: "#07142b",
      red: "#ff6b80",
      green: "#6ee7b7",
      yellow: "#f8d66d",
      blue: "#8ab4ff",
      magenta: "#c4a7ff",
      cyan: "#67e8f9",
      white: "#dbeafe",
      brightBlack: "#5573a4",
      brightRed: "#ff8fa0",
      brightGreen: "#a7f3d0",
      brightYellow: "#fde68a",
      brightBlue: "#bfdbfe",
      brightMagenta: "#ddd6fe",
      brightCyan: "#a5f3fc",
      brightWhite: "#ffffff"
    },
    preview: {
      background: "#2859bf",
      foreground: "#eaf2ff",
      muted: "#a9c2ee",
      accent: "#6ee7b7",
      directory: "#8ab4ff"
    }
  },
  {
    id: "dracula",
    name: "Dracula",
    palette: {
      background: "#282a36",
      foreground: "#f8f8f2",
      cursor: "#f8f8f2",
      selectionBackground: "#44475a",
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff"
    },
    preview: {
      background: "#282a36",
      foreground: "#f8f8f2",
      muted: "#9aa5ce",
      accent: "#50fa7b",
      directory: "#bd93f9"
    }
  },
  {
    id: "monokai",
    name: "Monokai",
    palette: {
      background: "#0f0f0f",
      foreground: "#f8f8f2",
      cursor: "#f8f8f0",
      selectionBackground: "#49483e",
      black: "#272822",
      red: "#f92672",
      green: "#a6e22e",
      yellow: "#f4bf75",
      blue: "#66d9ef",
      magenta: "#ae81ff",
      cyan: "#a1efe4",
      white: "#f8f8f2",
      brightBlack: "#75715e",
      brightRed: "#ff6188",
      brightGreen: "#a9dc76",
      brightYellow: "#ffd866",
      brightBlue: "#78dce8",
      brightMagenta: "#ab9df2",
      brightCyan: "#a1efe4",
      brightWhite: "#ffffff"
    },
    preview: {
      background: "#151515",
      foreground: "#f8f8f2",
      muted: "#a59f85",
      accent: "#a6e22e",
      directory: "#66d9ef"
    }
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    palette: {
      background: "#002b36",
      foreground: "#839496",
      cursor: "#93a1a1",
      selectionBackground: "#073642",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3"
    },
    preview: {
      background: "#002b36",
      foreground: "#93a1a1",
      muted: "#586e75",
      accent: "#859900",
      directory: "#268bd2"
    }
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    palette: {
      background: "#fdf6e3",
      foreground: "#657b83",
      cursor: "#586e75",
      selectionBackground: "#eee8d5",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3"
    },
    preview: {
      background: "#fdf6e3",
      foreground: "#586e75",
      muted: "#93a1a1",
      accent: "#859900",
      directory: "#268bd2"
    }
  },
  {
    id: "red-sands",
    name: "Red Sands",
    palette: {
      background: "#3b1816",
      foreground: "#f7e4d3",
      cursor: "#f7e4d3",
      selectionBackground: "#6d2c28",
      black: "#2b1110",
      red: "#ef4444",
      green: "#4ade80",
      yellow: "#f3c96b",
      blue: "#f59e8b",
      magenta: "#fb7185",
      cyan: "#f4a261",
      white: "#f7e4d3",
      brightBlack: "#8a4a41",
      brightRed: "#fb7185",
      brightGreen: "#86efac",
      brightYellow: "#fde68a",
      brightBlue: "#fca5a5",
      brightMagenta: "#f9a8d4",
      brightCyan: "#fdba74",
      brightWhite: "#fff7ed"
    },
    preview: {
      background: "#8b2c26",
      foreground: "#f7e4d3",
      muted: "#d7a38b",
      accent: "#4ade80",
      directory: "#fdba74"
    }
  },
  {
    id: "man-page",
    name: "Man Page",
    palette: {
      background: "#fff59d",
      foreground: "#1e1e12",
      cursor: "#1e1e12",
      selectionBackground: "#d8cc55",
      black: "#1e1e12",
      red: "#b91c1c",
      green: "#166534",
      yellow: "#92400e",
      blue: "#1d4ed8",
      magenta: "#7e22ce",
      cyan: "#0f766e",
      white: "#fef9c3",
      brightBlack: "#57534e",
      brightRed: "#dc2626",
      brightGreen: "#16a34a",
      brightYellow: "#b45309",
      brightBlue: "#2563eb",
      brightMagenta: "#9333ea",
      brightCyan: "#0d9488",
      brightWhite: "#fffde7"
    },
    preview: {
      background: "#fff59d",
      foreground: "#1e1e12",
      muted: "#605d24",
      accent: "#84cc16",
      directory: "#1d4ed8"
    }
  },
  {
    id: "novel",
    name: "Novel",
    palette: {
      background: "#f4ead7",
      foreground: "#3b2b25",
      cursor: "#3b2b25",
      selectionBackground: "#decfb5",
      black: "#3b2b25",
      red: "#8f2f2d",
      green: "#15803d",
      yellow: "#8a5a22",
      blue: "#355c7d",
      magenta: "#6d4c5f",
      cyan: "#317873",
      white: "#f4ead7",
      brightBlack: "#7b6a5d",
      brightRed: "#a9443f",
      brightGreen: "#22a357",
      brightYellow: "#a16207",
      brightBlue: "#4f759b",
      brightMagenta: "#8b5e7a",
      brightCyan: "#40938d",
      brightWhite: "#fffaf0"
    },
    preview: {
      background: "#f4ead7",
      foreground: "#3b2b25",
      muted: "#8c7a69",
      accent: "#15803d",
      directory: "#355c7d"
    }
  }
];

const terminalThemesById = new Map(terminalThemes.map((theme) => [theme.id, theme]));

const terminalFontOptions: TerminalFontOption[] = [
  {
    id: "source-code-pro",
    name: "Source Code Pro",
    stack: '"Source Code Pro", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace'
  },
  {
    id: "sf-mono",
    name: "SF Mono",
    stack: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace'
  },
  {
    id: "menlo",
    name: "Menlo",
    stack: 'Menlo, "SFMono-Regular", Monaco, Consolas, "Liberation Mono", monospace'
  },
  {
    id: "monaco",
    name: "Monaco",
    stack: 'Monaco, Menlo, "SFMono-Regular", Consolas, "Liberation Mono", monospace'
  },
  {
    id: "consolas",
    name: "Consolas",
    stack: 'Consolas, "Liberation Mono", Menlo, Monaco, monospace'
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    stack: '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace'
  }
];

const terminalFontOptionsById = new Map(terminalFontOptions.map((font) => [font.id, font]));

export function App() {
  const [language, setLanguage] = useState<AppLanguage>(() => {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isAppLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  });
  const [activeView, setActiveView] = useState<ActiveView>("hosts");
  const [activeTool, setActiveTool] = useState<ToolPanelId>("files");
  const [terminalThemeId, setTerminalThemeId] = useState<TerminalThemeId>(() => {
    const stored = window.localStorage.getItem(TERMINAL_THEME_STORAGE_KEY);
    return isTerminalThemeId(stored) ? stored : "pro";
  });
  const [terminalFontId, setTerminalFontId] = useState<TerminalFontId>(() => {
    const stored = window.localStorage.getItem(TERMINAL_FONT_STORAGE_KEY);
    return isTerminalFontId(stored) ? stored : DEFAULT_TERMINAL_FONT_ID;
  });
  const [terminalFontSize, setTerminalFontSize] = useState(() =>
    parseTerminalFontSize(window.localStorage.getItem(TERMINAL_FONT_SIZE_STORAGE_KEY))
  );
  const [toolDockWidth, setToolDockWidth] = useState(() =>
    parseToolDockWidth(window.localStorage.getItem(TOOL_DOCK_WIDTH_STORAGE_KEY))
  );
  const [sftpQueueHeight, setSftpQueueHeight] = useState(() =>
    parseSftpQueueHeight(window.localStorage.getItem(SFTP_QUEUE_HEIGHT_STORAGE_KEY))
  );
  const [isToolDockResizing, setIsToolDockResizing] = useState(false);
  const [isSftpQueueResizing, setIsSftpQueueResizing] = useState(false);
  const [isToolDockCollapsed, setIsToolDockCollapsed] = useState(true);
  const [isTerminalMaximized, setIsTerminalMaximized] = useState(false);
  const [hostSearch, setHostSearch] = useState("");
  const [selectedHostId, setSelectedHostId] = useState("");
  const [activeTerminalTabId, setActiveTerminalTabId] = useState("tab-preview");
  const [terminalTabs, setTerminalTabs] = useState<TerminalSession[]>([]);
  const [terminalTabMenu, setTerminalTabMenu] = useState<TerminalTabMenuState | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [hostProfiles, setHostProfiles] = useState<BackendHostProfile[]>([]);
  const [isHostLoading, setIsHostLoading] = useState(true);
  const [hostError, setHostError] = useState<string | null>(null);
  const [isHostEditorOpen, setIsHostEditorOpen] = useState(false);
  const [editingHostId, setEditingHostId] = useState<string | null>(null);
  const [hostForm, setHostForm] = useState<HostFormState>(defaultHostForm);
  const [isSavingHost, setIsSavingHost] = useState(false);
  const [hostFormError, setHostFormError] = useState<string | null>(null);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultMasterPassword, setVaultMasterPassword] = useState("");
  const [isVaultBusy, setIsVaultBusy] = useState(false);
  const [sftpSessionId, setSftpSessionId] = useState("");
  const [sftpPath, setSftpPath] = useState("~");
  const [sftpPathInput, setSftpPathInput] = useState("~");
  const [sftpParentPath, setSftpParentPath] = useState("");
  const [sftpEntries, setSftpEntries] = useState<SftpFileEntry[]>([]);
  const [selectedSftpPath, setSelectedSftpPath] = useState("");
  const [sftpDragTargetPath, setSftpDragTargetPath] = useState<string | null>(null);
  const [isCreatingSftpDirectory, setIsCreatingSftpDirectory] = useState(false);
  const [newSftpDirectoryName, setNewSftpDirectoryName] = useState("");
  const [renamingSftpPath, setRenamingSftpPath] = useState("");
  const [sftpRenameName, setSftpRenameName] = useState("");
  const [sftpSort, setSftpSort] = useState<SftpSortState>({ key: "name", direction: "asc" });
  const [isSftpLoading, setIsSftpLoading] = useState(false);
  const [sftpError, setSftpError] = useState<string | null>(null);
  const [sftpTransfers, setSftpTransfers] = useState<SftpTransfer[]>([]);
  const [forwardRules, setForwardRules] = useState<BackendForwardRule[]>([]);
  const [forwardForm, setForwardForm] = useState<ForwardFormState>(defaultForwardForm);
  const [editingForwardId, setEditingForwardId] = useState("");
  const [isForwardLoading, setIsForwardLoading] = useState(false);
  const [isSavingForward, setIsSavingForward] = useState(false);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const [monitorSnapshot, setMonitorSnapshot] = useState<MonitorSnapshot | null>(null);
  const [isMonitorLoading, setIsMonitorLoading] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [processEntries, setProcessEntries] = useState<BackendProcessEntry[]>([]);
  const [processSearch, setProcessSearch] = useState("");
  const [processSort, setProcessSort] = useState<ProcessSortState>({ key: "cpu", direction: "desc" });
  const [isProcessLoading, setIsProcessLoading] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [killingProcessPid, setKillingProcessPid] = useState<number | null>(null);
  const [quickCommands, setQuickCommands] = useState<BackendQuickCommand[]>([]);
  const [quickCommandForm, setQuickCommandForm] = useState<QuickCommandFormState>(defaultQuickCommandForm);
  const [editingCommandId, setEditingCommandId] = useState("");
  const [isCommandLoading, setIsCommandLoading] = useState(false);
  const [isSavingCommand, setIsSavingCommand] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);

  const text = getMessages(language);
  const terminalTabsRef = useRef<TerminalSession[]>([]);
  const openingHostTabIdsRef = useRef<Map<string, string>>(new Map());
  const xtermEntriesRef = useRef<Map<string, XTermEntry>>(new Map());
  const pendingTerminalOutputRef = useRef<Map<string, string[]>>(new Map());
  const terminalInputBuffersRef = useRef<Map<string, string>>(new Map());
  const resizeTimersRef = useRef<Map<string, number>>(new Map());
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const newSftpDirectoryInputRef = useRef<HTMLInputElement | null>(null);
  const renameSftpInputRef = useRef<HTMLInputElement | null>(null);
  const sftpContextRef = useRef({ sessionId: "", path: "~" });
  const sftpRefreshRef = useRef<(path?: string) => void>(() => undefined);
  const sftpUploadTargetsRef = useRef<Map<string, string>>(new Map());
  const sftpRefreshTimersRef = useRef<Map<string, number>>(new Map());
  const forwardProfileIdRef = useRef("");
  const monitorSessionIdRef = useRef("");
  const processSessionIdRef = useRef("");
  const commandProfileIdRef = useRef("");
  const hostStatusById = useMemo(() => buildHostStatusMap(terminalTabs), [terminalTabs]);
  const hosts = useMemo(() => hostProfiles.map((profile) => profileToHostItem(profile, hostStatusById.get(profile.id))), [hostProfiles, hostStatusById]);
  const placeholderHost = useMemo(() => createPlaceholderHost(language), [language]);
  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? placeholderHost;
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
  const visibleTerminalTabs = terminalTabs;
  const activeTerminal = visibleTerminalTabs.find((tab) => tab.id === activeTerminalTabId) ?? visibleTerminalTabs[0] ?? previewTerminalTab;
  const isHostPickerActive = activeTerminal.kind === "hostPicker";
  const activeTerminalHost = hosts.find((host) => host.id === activeTerminal.hostId) ?? selectedHost;
  const forwardProfile =
    activeTerminalHost.id !== "__placeholder" ? activeTerminalHost : selectedHost.id !== "__placeholder" ? selectedHost : null;
  const forwardProfileId = forwardProfile?.id ?? "";
  const activeTerminalHostLabel = activeTerminalHost.id === "__placeholder" ? text.terminal.noHost : formatHostAddress(activeTerminalHost);
  const activeToolDefinition = toolDefinitions.find((tool) => tool.id === activeTool) ?? toolDefinitions[0];
  const terminalTheme = terminalThemesById.get(terminalThemeId) ?? terminalThemes[0];
  const terminalFont = terminalFontOptionsById.get(terminalFontId) ?? terminalFontOptions[0];
  const isSftpAvailable = activeTerminal.status === "connected" && Boolean(activeTerminal.sessionId);
  const isForwardSessionAvailable =
    activeTerminal.status === "connected" && Boolean(activeTerminal.sessionId) && Boolean(forwardProfileId) && activeTerminal.hostId === forwardProfileId;
  const isMonitorSessionAvailable = activeTerminal.status === "connected" && Boolean(activeTerminal.sessionId);
  const isProcessSessionAvailable = activeTerminal.status === "connected" && Boolean(activeTerminal.sessionId);
  const isCommandSessionAvailable = activeTerminal.status === "connected" && Boolean(activeTerminal.sessionId) && Boolean(activeTerminal.channelId);
  const selectedSftpEntry = sftpEntries.find((entry) => entry.path === selectedSftpPath);
  const sortedSftpEntries = useMemo(() => sortSftpEntries(sftpEntries, sftpSort), [sftpEntries, sftpSort]);
  const sortedProcessEntries = useMemo(
    () => filterAndSortProcesses(processEntries, processSearch, processSort),
    [processEntries, processSearch, processSort]
  );
  const groupedQuickCommands = useMemo(() => groupQuickCommands(quickCommands), [quickCommands]);
  const shouldCloseActiveTerminalTab =
    activeTerminal.id !== "tab-preview" &&
    (activeTerminal.status === "disconnected" || activeTerminal.status === "failed" || activeTerminal.kind === "hostPicker");
  const isTerminalStopButtonDisabled =
    activeTerminal.id === "tab-preview" ||
    (!shouldCloseActiveTerminalTab && (!activeTerminal.sessionId || activeTerminal.status === "disconnected"));

  const visibleHosts = useMemo(() => filterHosts(hosts, hostSearch, language), [hosts, hostSearch, language]);
  const isHostsHome = activeView === "hosts";
  const workbenchStyle =
    !isToolDockCollapsed && !isHostPickerActive && !isTerminalMaximized
      ? ({ "--tool-dock-width": `${toolDockWidth}px` } as CSSProperties)
      : undefined;
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

  const updateTerminalCwd = useCallback((tabId: string, cwd: string) => {
    setTerminalTabs((current) => {
      const updated = current.map((tab) => (tab.id === tabId ? { ...tab, cwd } : tab));
      terminalTabsRef.current = updated;
      return updated;
    });
  }, []);

  const recordTerminalInput = useCallback(
    (tabId: string, data: string) => {
      let buffer = terminalInputBuffersRef.current.get(tabId) ?? "";

      for (const char of data) {
        if (char === "\r" || char === "\n") {
          const command = buffer.trim();
          buffer = "";
          const tab = terminalTabsRef.current.find((item) => item.id === tabId);
          const nextCwd = tab ? inferCwdFromShellCommand(command, tab.cwd) : null;
          if (nextCwd && tab && nextCwd !== tab.cwd) {
            updateTerminalCwd(tabId, nextCwd);
          }
          continue;
        }

        if (char === "\u007f" || char === "\b") {
          buffer = buffer.slice(0, -1);
          continue;
        }

        if (char === "\u0003" || char === "\u0015") {
          buffer = "";
          continue;
        }

        if (char >= " " && char !== "\u007f") {
          buffer += char;
        }
      }

      terminalInputBuffersRef.current.set(tabId, buffer.slice(-512));
    },
    [updateTerminalCwd]
  );

  const mountTerminal = useCallback(
    (tabId: string, node: HTMLDivElement | null) => {
      if (!node || xtermEntriesRef.current.has(tabId)) {
        return;
      }

      const terminal = new XTermTerminal({
        allowProposedApi: false,
        cursorBlink: true,
        convertEol: true,
        fontFamily: terminalFont.stack,
        fontSize: terminalFontSize,
        lineHeight: 1.35,
        scrollback: 3000,
        theme: terminalTheme.palette
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      const inputDisposable = terminal.onData((data) => {
        recordTerminalInput(tabId, data);
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
    [fitAndResizeTerminal, recordTerminalInput, terminalFont.stack, terminalFontSize, terminalTheme.palette]
  );

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem(TERMINAL_THEME_STORAGE_KEY, terminalTheme.id);
    for (const entry of xtermEntriesRef.current.values()) {
      entry.terminal.options.theme = terminalTheme.palette;
      entry.terminal.refresh(0, Math.max(0, entry.terminal.rows - 1));
    }
  }, [terminalTheme]);

  useEffect(() => {
    window.localStorage.setItem(TERMINAL_FONT_STORAGE_KEY, terminalFont.id);
    window.localStorage.setItem(TERMINAL_FONT_SIZE_STORAGE_KEY, String(terminalFontSize));
    for (const [tabId, entry] of xtermEntriesRef.current) {
      entry.terminal.options.fontFamily = terminalFont.stack;
      entry.terminal.options.fontSize = terminalFontSize;
      entry.fitAddon.fit();
      entry.terminal.refresh(0, Math.max(0, entry.terminal.rows - 1));
      fitAndResizeTerminal(tabId);
    }
  }, [fitAndResizeTerminal, terminalFont, terminalFontSize]);

  useEffect(() => {
    window.localStorage.setItem(TOOL_DOCK_WIDTH_STORAGE_KEY, String(toolDockWidth));
  }, [toolDockWidth]);

  useEffect(() => {
    window.localStorage.setItem(SFTP_QUEUE_HEIGHT_STORAGE_KEY, String(sftpQueueHeight));
  }, [sftpQueueHeight]);

  useEffect(() => {
    terminalTabsRef.current = terminalTabs;
  }, [terminalTabs]);

  useEffect(() => {
    if (!terminalTabMenu) {
      return undefined;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".terminal-tab-menu") || target?.closest(".terminal-tab")) {
        return;
      }
      setTerminalTabMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTerminalTabMenu(null);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [terminalTabMenu]);

  useEffect(() => {
    sftpContextRef.current = {
      sessionId: activeTerminal.sessionId ?? "",
      path: sftpPath
    };
  }, [activeTerminal.sessionId, sftpPath]);

  useEffect(() => {
    forwardProfileIdRef.current = forwardProfileId;
  }, [forwardProfileId]);

  useEffect(() => {
    monitorSessionIdRef.current = activeTerminal.sessionId ?? "";
    processSessionIdRef.current = activeTerminal.sessionId ?? "";
  }, [activeTerminal.sessionId]);

  useEffect(() => {
    commandProfileIdRef.current = forwardProfileId;
  }, [forwardProfileId]);

  useEffect(() => {
    sftpRefreshRef.current = (path?: string) => {
      void loadSftpPath(path ?? sftpContextRef.current.path);
    };
  });

  useEffect(() => {
    if (activeTool === "forwards") {
      void loadForwardRules(forwardProfileId);
    }
  }, [activeTool, forwardProfileId]);

  useEffect(() => {
    if (activeTool !== "monitor") {
      return undefined;
    }
    if (!isMonitorSessionAvailable || !activeTerminal.sessionId) {
      setMonitorSnapshot(null);
      setMonitorError(null);
      setIsMonitorLoading(false);
      return undefined;
    }
    const sessionId = activeTerminal.sessionId;
    void startMonitor(sessionId);
    return () => {
      void window.termira.invoke("monitor.stop", { sessionId }).catch(() => undefined);
    };
  }, [activeTool, activeTerminal.sessionId, isMonitorSessionAvailable]);

  useEffect(() => {
    if (activeTool !== "processes") {
      return;
    }
    if (!isProcessSessionAvailable || !activeTerminal.sessionId) {
      setProcessEntries([]);
      setProcessError(null);
      setIsProcessLoading(false);
      return;
    }
    void loadProcessList(activeTerminal.sessionId);
  }, [activeTool, activeTerminal.sessionId, isProcessSessionAvailable]);

  useEffect(() => {
    if (activeTool === "commands") {
      void loadQuickCommands(forwardProfileId);
    }
  }, [activeTool, forwardProfileId]);

  useEffect(() => {
    void refreshProfiles();
    void refreshVaultStatus();
  }, []);

  useEffect(() => {
    if (selectedHostId && hosts.length > 0 && !hosts.some((host) => host.id === selectedHostId)) {
      setSelectedHostId("");
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
    if (activeView === "terminal" && terminalTabs.length === 0) {
      setActiveView("hosts");
    }
  }, [activeView, terminalTabs.length]);

  useEffect(() => {
    const onOutput = (payload: unknown) => {
      const output = payload as Partial<TerminalOutputPayload>;
      if (typeof output.sessionId !== "string" || typeof output.channelId !== "string" || typeof output.data !== "string") {
        return;
      }

      const tab =
        terminalTabsRef.current.find((item) => item.channelId === output.channelId) ??
        terminalTabsRef.current.find((item) => !item.channelId && item.sessionId === output.sessionId);
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

    const onSftpListUpdated = (payload: unknown) => {
      const result = payload as Partial<SftpListResult>;
      if (typeof result.sessionId !== "string" || typeof result.path !== "string" || !Array.isArray(result.entries)) {
        return;
      }
      if (result.sessionId !== sftpContextRef.current.sessionId) {
        return;
      }
      setSftpSessionId(result.sessionId);
      setSftpPath(result.path);
      setSftpPathInput(result.path);
      setSftpParentPath(typeof result.parentPath === "string" ? result.parentPath : "");
      setSftpEntries(result.entries as SftpFileEntry[]);
    };

    const onTransferEvent = (payload: unknown) => {
      const transfer = payload as Partial<SftpTransfer>;
      if (
        typeof transfer.transferId !== "string" ||
        typeof transfer.sessionId !== "string" ||
        typeof transfer.direction !== "string" ||
        typeof transfer.status !== "string"
      ) {
        return;
      }
      const nextTransfer = transfer as SftpTransfer;
      upsertSftpTransfer(nextTransfer);
      const context = sftpContextRef.current;
      const uploadTargetPath = sftpUploadTargetsRef.current.get(nextTransfer.transferId);
      const completedUpload = nextTransfer.status === "completed" && nextTransfer.direction === "upload";
      if (
        completedUpload &&
        nextTransfer.sessionId === context.sessionId &&
        (sameRemotePath(uploadTargetPath, context.path) || sameRemoteParent(nextTransfer.remotePath, context.path))
      ) {
        scheduleSftpRefresh(context.path);
      }
      if (completedUpload || nextTransfer.status === "failed" || nextTransfer.status === "cancelled") {
        sftpUploadTargetsRef.current.delete(nextTransfer.transferId);
      }
    };

    const onForwardStatus = (payload: unknown) => {
      const rule = payload as Partial<BackendForwardRule>;
      if (
        typeof rule.id !== "string" ||
        typeof rule.profileId !== "string" ||
        typeof rule.name !== "string" ||
        typeof rule.type !== "string" ||
        typeof rule.bindHost !== "string" ||
        typeof rule.bindPort !== "number" ||
        typeof rule.status !== "string"
      ) {
        return;
      }
      if (rule.profileId !== forwardProfileIdRef.current) {
        return;
      }
      upsertForwardRule(rule as BackendForwardRule);
    };

    const onMonitorSnapshot = (payload: unknown) => {
      const snapshot = payload as Partial<MonitorSnapshot>;
      if (typeof snapshot.sessionId !== "string" || typeof snapshot.available !== "boolean") {
        return;
      }
      if (snapshot.sessionId !== monitorSessionIdRef.current) {
        return;
      }
      const nextSnapshot = snapshot as MonitorSnapshot;
      setMonitorSnapshot(nextSnapshot);
      setMonitorError(nextSnapshot.available ? null : nextSnapshot.errorMessage ?? text.tools.monitor.unavailableReason);
      setIsMonitorLoading(false);
    };

    const onProcessListUpdated = (payload: unknown) => {
      const result = payload as Partial<ProcessListResult>;
      if (typeof result.sessionId !== "string" || !Array.isArray(result.processes)) {
        return;
      }
      if (result.sessionId !== processSessionIdRef.current) {
        return;
      }
      setProcessEntries(result.processes as BackendProcessEntry[]);
      setProcessError(null);
      setIsProcessLoading(false);
    };

    window.termira.removeAllListeners?.("terminal.output");
    window.termira.removeAllListeners?.("terminal.closed");
    window.termira.removeAllListeners?.("ssh.statusChanged");
    window.termira.removeAllListeners?.("sftp.listUpdated");
    window.termira.removeAllListeners?.("transfer.progress");
    window.termira.removeAllListeners?.("transfer.completed");
    window.termira.removeAllListeners?.("transfer.failed");
    window.termira.removeAllListeners?.("forward.statusChanged");
    window.termira.removeAllListeners?.("monitor.snapshot");
    window.termira.removeAllListeners?.("process.listUpdated");

    window.termira.on("terminal.output", onOutput);
    window.termira.on("terminal.closed", onTerminalClosed);
    window.termira.on("ssh.statusChanged", onSshStatus);
    window.termira.on("sftp.listUpdated", onSftpListUpdated);
    window.termira.on("transfer.progress", onTransferEvent);
    window.termira.on("transfer.completed", onTransferEvent);
    window.termira.on("transfer.failed", onTransferEvent);
    window.termira.on("forward.statusChanged", onForwardStatus);
    window.termira.on("monitor.snapshot", onMonitorSnapshot);
    window.termira.on("process.listUpdated", onProcessListUpdated);

    return () => {
      window.termira.off("terminal.output", onOutput);
      window.termira.off("terminal.closed", onTerminalClosed);
      window.termira.off("ssh.statusChanged", onSshStatus);
      window.termira.off("sftp.listUpdated", onSftpListUpdated);
      window.termira.off("transfer.progress", onTransferEvent);
      window.termira.off("transfer.completed", onTransferEvent);
      window.termira.off("transfer.failed", onTransferEvent);
      window.termira.off("forward.statusChanged", onForwardStatus);
      window.termira.off("monitor.snapshot", onMonitorSnapshot);
      window.termira.off("process.listUpdated", onProcessListUpdated);
    };
  }, []);

  useEffect(() => {
    if (activeTool !== "files") {
      return;
    }

    if (!isSftpAvailable || !activeTerminal.sessionId) {
      setSftpSessionId("");
      setSftpEntries([]);
      setSelectedSftpPath("");
      return;
    }

    if (sftpSessionId !== activeTerminal.sessionId) {
      void loadSftpPath(activeTerminal.cwd || "~", activeTerminal.sessionId);
      return;
    }

    if (activeTerminal.cwd && activeTerminal.cwd !== sftpPath) {
      void loadSftpPath(activeTerminal.cwd, activeTerminal.sessionId);
    }
  }, [activeTool, activeTerminal.cwd, activeTerminal.sessionId, isSftpAvailable, sftpSessionId]);

  useEffect(() => {
    if (isCreatingSftpDirectory) {
      newSftpDirectoryInputRef.current?.focus();
      newSftpDirectoryInputRef.current?.select();
    }
  }, [isCreatingSftpDirectory]);

  useEffect(() => {
    if (renamingSftpPath) {
      renameSftpInputRef.current?.focus();
      renameSftpInputRef.current?.select();
    }
  }, [renamingSftpPath]);

  useEffect(() => {
    const resizeActiveTerminal = () => {
      if (activeTerminal.id !== "tab-preview") {
        fitAndResizeTerminal(activeTerminal.id);
        const entry = xtermEntriesRef.current.get(activeTerminal.id);
        if (entry) {
          entry.terminal.refresh(0, Math.max(0, entry.terminal.rows - 1));
        }
      }
    };
    window.addEventListener("resize", resizeActiveTerminal);
    resizeActiveTerminal();

    return () => window.removeEventListener("resize", resizeActiveTerminal);
  }, [activeTerminal.id, fitAndResizeTerminal, isTerminalMaximized, isToolDockCollapsed, toolDockWidth]);

  useEffect(() => {
    if (activeTerminal.id === "tab-preview") {
      return;
    }

    const firstFrame = window.requestAnimationFrame(() => {
      const entry = xtermEntriesRef.current.get(activeTerminal.id);
      if (!entry) {
        return;
      }
      fitAndResizeTerminal(activeTerminal.id);
      entry.terminal.refresh(0, Math.max(0, entry.terminal.rows - 1));

      window.requestAnimationFrame(() => {
        entry.terminal.refresh(0, Math.max(0, entry.terminal.rows - 1));
        entry.terminal.focus();
      });
    });

    return () => window.cancelAnimationFrame(firstFrame);
  }, [activeTerminal.id, fitAndResizeTerminal]);

  useEffect(
    () => () => {
      for (const tabId of xtermEntriesRef.current.keys()) {
        disposeTerminal(tabId);
      }
      for (const timer of sftpRefreshTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      sftpRefreshTimersRef.current.clear();
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
      const editingProfile = editingHostId ? hostProfiles.find((profile) => profile.id === editingHostId) : undefined;
      const port = Number.parseInt(hostForm.port, 10);
      if (!hostForm.name.trim() || !hostForm.host.trim() || !hostForm.username.trim() || !Number.isInteger(port)) {
        throw new Error(text.hostEditor.validation);
      }

      let credentialRef =
        editingProfile?.auth.type === hostForm.authType && editingProfile.auth.credentialRef
          ? editingProfile.auth.credentialRef
          : undefined;
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
          credentialId: credentialRef,
          type: hostForm.authType,
          password: hostForm.authType === "privateKey" ? undefined : hostForm.password,
          passphrase: hostForm.authType === "privateKey" ? hostForm.passphrase : undefined,
          privateKeyContent: undefined
        });
        credentialRef = credential.credentialId;
        setVaultStatus(status);
      }

      if (!hostForm.saveCredential) {
        credentialRef = undefined;
      }

      const profilePayload = {
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
      };

      if (editingHostId) {
        await window.termira.invoke<BackendHostProfile>("profile.update", {
          id: editingHostId,
          profile: profilePayload
        });
      } else {
        await window.termira.invoke<BackendHostProfile>("profile.create", profilePayload);
      }

      setHostForm(defaultHostForm);
      setEditingHostId(null);
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

  function openCreateHostEditor() {
    setEditingHostId(null);
    setHostForm(defaultHostForm);
    setHostFormError(null);
    setIsHostEditorOpen(true);
  }

  function openEditHostEditor(hostId: string) {
    const profile = hostProfiles.find((item) => item.id === hostId);
    if (!profile) {
      return;
    }

    setEditingHostId(profile.id);
    setHostForm(profileToHostForm(profile));
    setHostFormError(null);
    setIsHostEditorOpen(true);
  }

  async function deleteHost(host: HostItem) {
    if (host.id === "__placeholder") {
      return;
    }
    const profile = hostProfiles.find((item) => item.id === host.id);
    const credentialRef = profile?.auth.credentialRef;
    const accepted = window.confirm(text.hosts.confirmDeleteHost(translate(host.name, language), Boolean(credentialRef)));
    if (!accepted) {
      return;
    }

    setHostError(null);
    try {
      if (credentialRef) {
        await window.termira.invoke("credential.delete", { credentialId: credentialRef });
      }
      await window.termira.invoke("profile.delete", { id: host.id });
      const tabsToClose = terminalTabsRef.current.filter((tab) => tab.hostId === host.id);
      for (const tab of tabsToClose) {
        if (tab.sessionId && tab.channelId) {
          await window.termira.invoke("terminal.close", { sessionId: tab.sessionId, channelId: tab.channelId }).catch(() => undefined);
        }
        if (tab.sessionId) {
          await window.termira.invoke("ssh.disconnect", { sessionId: tab.sessionId }).catch(() => undefined);
        }
        disposeTerminal(tab.id);
      }
      const remainingTabs = terminalTabsRef.current.filter((tab) => tab.hostId !== host.id);
      terminalTabsRef.current = remainingTabs;
      setTerminalTabs(remainingTabs);
      if (remainingTabs.length === 0) {
        setActiveView("hosts");
      }
      if (selectedHostId === host.id) {
        setSelectedHostId("");
      }
      await refreshProfiles();
      await refreshVaultStatus();
    } catch (error) {
      setHostError(errorMessage(error));
      await refreshVaultStatus();
    }
  }

  function selectHost(hostId: string, options: { preserveView?: boolean } = {}) {
    setSelectedHostId(hostId);
    if (!options.preserveView) {
      setActiveView("hosts");
    }
  }

  function closeTerminalTab(tabId: string) {
    if (terminalTabMenu?.tabId === tabId) {
      setTerminalTabMenu(null);
    }
    const tab = terminalTabs.find((item) => item.id === tabId);
    if (tab?.sessionId && tab.channelId) {
      void window.termira.invoke("terminal.close", { sessionId: tab.sessionId, channelId: tab.channelId }).catch(() => undefined);
    }
    if (tab?.sessionId) {
      void window.termira.invoke("ssh.disconnect", { sessionId: tab.sessionId }).catch(() => undefined);
    }
    if (tab?.sessionId && sftpSessionId === tab.sessionId) {
      setSftpSessionId("");
      setSftpEntries([]);
      setSelectedSftpPath("");
    }
    disposeTerminal(tabId);

    const nextTabs = terminalTabs.filter((item) => item.id !== tabId);
    terminalTabsRef.current = nextTabs;
    setTerminalTabs(nextTabs);
    if (activeTerminalTabId === tabId) {
      setActiveTerminalTabId(nextTabs[0]?.id ?? "tab-preview");
    }
    if (nextTabs.length === 0) {
      setActiveView("hosts");
    }
  }

  function openTerminalTabMenu(tabId: string, event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (tabId === "tab-preview") {
      return;
    }
    setActiveTerminalTabId(tabId);
    setTerminalTabMenu({
      tabId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 292)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 320))
    });
  }

  function duplicateTerminalTab(tabId: string) {
    setTerminalTabMenu(null);
    const tab = terminalTabsRef.current.find((item) => item.id === tabId);
    if (!tab) {
      return;
    }
    if (tab.kind === "hostPicker") {
      openNewTerminalTab();
      return;
    }
    const host = hosts.find((item) => item.id === tab.hostId);
    if (host) {
      void openTerminalForHost(host);
      return;
    }

    const nextTab: TerminalSession = {
      ...tab,
      id: createTerminalTabId(),
      status: "disconnected",
      sessionId: undefined,
      channelId: undefined,
      error: undefined
    };
    const nextTabs = [...terminalTabsRef.current, nextTab];
    terminalTabsRef.current = nextTabs;
    setTerminalTabs(nextTabs);
    setActiveTerminalTabId(nextTab.id);
    setActiveView("terminal");
  }

  function renameTerminalTab(tabId: string) {
    setTerminalTabMenu(null);
    const tab = terminalTabsRef.current.find((item) => item.id === tabId);
    if (!tab) {
      return;
    }
    const currentTitle = translate(tab.title, language);
    const nextTitle = window.prompt(text.terminal.tabMenu.renamePrompt, currentTitle)?.trim();
    if (!nextTitle || nextTitle === currentTitle) {
      return;
    }
    setTerminalTabs((current) => {
      const updated = current.map((item) =>
        item.id === tabId
          ? {
              ...item,
              title: toLocalized(nextTitle)
            }
          : item
      );
      terminalTabsRef.current = updated;
      return updated;
    });
  }

  function reconnectTerminalTab(tabId: string) {
    setTerminalTabMenu(null);
    const tab = terminalTabsRef.current.find((item) => item.id === tabId);
    if (!tab || tab.kind === "hostPicker" || tab.status === "connected" || tab.status === "connecting") {
      return;
    }
    const host = hosts.find((item) => item.id === tab.hostId);
    if (host) {
      void openTerminalForHost(host, tabId);
    }
  }

  async function openTerminalForHost(
    host: HostItem,
    existingTabId?: string,
    options: { dedupeOpening?: boolean } = {}
  ) {
    if (host.id === "__placeholder") {
      return;
    }

    const shouldDedupeOpening = options.dedupeOpening === true && !existingTabId;
    const openingTabId = openingHostTabIdsRef.current.get(host.id);
    if (shouldDedupeOpening && openingTabId) {
      setSelectedHostId(host.id);
      setActiveTerminalTabId(openingTabId);
      setActiveView("terminal");
      return;
    }

    const tabId = existingTabId && existingTabId !== "tab-preview" ? existingTabId : createTerminalTabId();
    const currentTab = terminalTabsRef.current.find((tab) => tab.id === tabId);
    if (currentTab?.status === "connected" || currentTab?.status === "connecting") {
      setActiveTerminalTabId(currentTab.id);
      return;
    }
    if (currentTab?.sessionId && currentTab.channelId) {
      await window.termira.invoke("terminal.close", { sessionId: currentTab.sessionId, channelId: currentTab.channelId }).catch(() => undefined);
    }
    if (currentTab?.sessionId) {
      await window.termira.invoke("ssh.disconnect", { sessionId: currentTab.sessionId }).catch(() => undefined);
    }

    const nextTab: TerminalSession = {
      id: tabId,
      kind: "terminal",
      hostId: host.id,
      title: host.name,
      cwd: host.remotePath,
      status: "connecting"
    };

    setSelectedHostId(host.id);
    setTerminalError(null);
    if (shouldDedupeOpening) {
      openingHostTabIdsRef.current.set(host.id, tabId);
    }
    const nextTabs = [...terminalTabsRef.current.filter((tab) => tab.id !== tabId), nextTab];
    terminalTabsRef.current = nextTabs;
    setTerminalTabs(nextTabs);
    setActiveTerminalTabId(tabId);
    setActiveView("terminal");

    const entry = xtermEntriesRef.current.get(tabId);
    entry?.terminal.reset();

    let createdSessionId: string | undefined;
    let createdChannelId: string | undefined;

    try {
      const session = await window.termira.invoke<SshSessionView>("ssh.connect", { profileId: host.id });
      createdSessionId = session.sessionId;
      const sessionBoundTabs: TerminalSession[] = terminalTabsRef.current.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              sessionId: session.sessionId,
              status: "connecting",
              error: undefined
            }
          : tab
      );
      terminalTabsRef.current = sessionBoundTabs;
      setTerminalTabs(sessionBoundTabs);

      const dimensions = terminalDimensions(tabId, xtermEntriesRef.current);
      const shell = await window.termira.invoke<TerminalOpenResult>("terminal.openShell", {
        sessionId: session.sessionId,
        cols: dimensions.cols,
        rows: dimensions.rows,
        term: "xterm-256color"
      });
      createdChannelId = shell.channelId;

      const shellBoundTabs: TerminalSession[] = terminalTabsRef.current.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              sessionId: session.sessionId,
              channelId: shell.channelId,
              status: "connected",
              error: undefined
            }
          : tab
      );
      terminalTabsRef.current = shellBoundTabs;
      setTerminalTabs(shellBoundTabs);
      fitAndResizeTerminal(tabId);
    } catch (error) {
      if (createdSessionId && createdChannelId) {
        await window.termira
          .invoke("terminal.close", { sessionId: createdSessionId, channelId: createdChannelId })
          .catch(() => undefined);
      }
      if (createdSessionId) {
        await window.termira.invoke("ssh.disconnect", { sessionId: createdSessionId }).catch(() => undefined);
      }
      const message = errorMessage(error);
      setTerminalError(message);
      setTerminalTabs((current) => {
        const updated: TerminalSession[] = current.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                status: "failed",
                error: message
              }
            : tab
        );
        terminalTabsRef.current = updated;
        return updated;
      });
      xtermEntriesRef.current.get(tabId)?.terminal.writeln(`\r\n${message}`);
    } finally {
      if (shouldDedupeOpening && openingHostTabIdsRef.current.get(host.id) === tabId) {
        openingHostTabIdsRef.current.delete(host.id);
      }
    }
  }

  async function connectActiveTerminal() {
    await openTerminalForHost(activeTerminalHost, activeTerminal.id);
  }

  function openNewTerminalTab() {
    const tabId = createHostPickerTabId();
    const nextTab: TerminalSession = {
      id: tabId,
      kind: "hostPicker",
      hostId: HOST_PICKER_HOST_ID,
      title: createHostPickerTitle(),
      cwd: "~",
      status: "disconnected"
    };
    const nextTabs = [...terminalTabsRef.current, nextTab];
    terminalTabsRef.current = nextTabs;
    setTerminalTabs(nextTabs);
    setActiveTerminalTabId(tabId);
    setSelectedHostId("");
    setTerminalError(null);
    setActiveView("terminal");
  }

  async function disconnectTerminalTab(tabId: string) {
    setTerminalTabMenu(null);
    const tab = terminalTabsRef.current.find((item) => item.id === tabId);
    if (!tab?.sessionId) {
      return;
    }
    const sessionId = tab.sessionId;
    const channelId = tab.channelId;
    setTerminalError(null);
    setTerminalTabs((current) => {
      const updated: TerminalSession[] = current.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              status: "disconnected",
              sessionId: undefined,
              channelId: undefined
            }
          : tab
      );
      terminalTabsRef.current = updated;
      return updated;
    });
    if (sftpSessionId === sessionId) {
      setSftpSessionId("");
      setSftpEntries([]);
      setSelectedSftpPath("");
    }

    let firstError: unknown;
    if (channelId) {
      await window.termira
        .invoke("terminal.close", {
          sessionId,
          channelId
        })
        .catch((error) => {
          firstError = firstError ?? error;
        });
    }
    await window.termira.invoke("ssh.disconnect", { sessionId }).catch((error) => {
      firstError = firstError ?? error;
    });

    if (firstError) {
      setTerminalError(errorMessage(firstError));
    }
  }

  async function disconnectActiveTerminal() {
    await disconnectTerminalTab(activeTerminal.id);
  }

  function handleTerminalStopButton() {
    if (shouldCloseActiveTerminalTab) {
      closeTerminalTab(activeTerminal.id);
      return;
    }
    void disconnectActiveTerminal();
  }

  async function startMonitor(sessionId = activeTerminal.sessionId) {
    if (!sessionId || activeTerminal.status !== "connected") {
      setMonitorError(text.tools.monitor.noSession);
      return;
    }
    setIsMonitorLoading(true);
    setMonitorError(null);
    try {
      const snapshot = await window.termira.invoke<MonitorSnapshot>("monitor.start", { sessionId });
      setMonitorSnapshot(snapshot);
      setMonitorError(snapshot.available ? null : snapshot.errorMessage ?? text.tools.monitor.unavailableReason);
    } catch (error) {
      setMonitorError(errorMessage(error));
    } finally {
      setIsMonitorLoading(false);
    }
  }

  async function refreshMonitorSnapshot() {
    const sessionId = activeTerminal.sessionId;
    if (!sessionId || activeTerminal.status !== "connected") {
      setMonitorError(text.tools.monitor.noSession);
      return;
    }
    setIsMonitorLoading(true);
    setMonitorError(null);
    try {
      const snapshot = await window.termira.invoke<MonitorSnapshot>("monitor.snapshot", { sessionId });
      setMonitorSnapshot(snapshot);
      setMonitorError(snapshot.available ? null : snapshot.errorMessage ?? text.tools.monitor.unavailableReason);
    } catch (error) {
      setMonitorError(errorMessage(error));
    } finally {
      setIsMonitorLoading(false);
    }
  }

  async function loadProcessList(sessionId = activeTerminal.sessionId) {
    if (!sessionId || activeTerminal.status !== "connected") {
      setProcessError(text.tools.processes.noSession);
      return;
    }
    setIsProcessLoading(true);
    setProcessError(null);
    try {
      const result = await window.termira.invoke<ProcessListResult>("process.list", { sessionId });
      setProcessEntries(result.processes);
    } catch (error) {
      setProcessError(errorMessage(error));
    } finally {
      setIsProcessLoading(false);
    }
  }

  function changeProcessSort(key: ProcessSortKey) {
    setProcessSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc"
    }));
  }

  async function killProcess(process: BackendProcessEntry) {
    if (!activeTerminal.sessionId) {
      setProcessError(text.tools.processes.noSession);
      return;
    }
    const accepted = window.confirm(text.tools.processes.confirmKill(process.pid, process.name));
    if (!accepted) {
      return;
    }
    setKillingProcessPid(process.pid);
    setProcessError(null);
    try {
      await window.termira.invoke("process.kill", {
        sessionId: activeTerminal.sessionId,
        pid: process.pid,
        signal: "TERM"
      });
      await loadProcessList(activeTerminal.sessionId);
    } catch (error) {
      setProcessError(errorMessage(error));
    } finally {
      setKillingProcessPid(null);
    }
  }

  async function loadQuickCommands(profileId = forwardProfileId) {
    setIsCommandLoading(true);
    setCommandError(null);
    try {
      const commands = await window.termira.invoke<BackendQuickCommand[]>("command.list", { profileId: profileId || undefined });
      setQuickCommands(commands);
    } catch (error) {
      setCommandError(errorMessage(error));
    } finally {
      setIsCommandLoading(false);
    }
  }

  function setQuickCommandFormField<Key extends keyof QuickCommandFormState>(field: Key, value: QuickCommandFormState[Key]) {
    setQuickCommandForm((current) => ({ ...current, [field]: value }));
  }

  function resetQuickCommandForm() {
    setQuickCommandForm(defaultQuickCommandForm);
    setEditingCommandId("");
    setCommandError(null);
  }

  function editQuickCommand(command: BackendQuickCommand) {
    setEditingCommandId(command.id);
    setQuickCommandForm({
      name: command.name,
      groupName: command.groupName ?? "",
      command: command.command,
      note: command.note ?? "",
      profileScoped: Boolean(command.profileId)
    });
    setCommandError(null);
  }

  async function submitQuickCommand(event?: FormEvent) {
    event?.preventDefault();
    if (!quickCommandForm.name.trim()) {
      setCommandError(text.tools.commands.nameRequired);
      return;
    }
    if (!quickCommandForm.command.trim()) {
      setCommandError(text.tools.commands.commandRequired);
      return;
    }
    setIsSavingCommand(true);
    setCommandError(null);
    try {
      const payload = {
        id: editingCommandId || undefined,
        profileId: quickCommandForm.profileScoped && forwardProfileId ? forwardProfileId : undefined,
        groupName: quickCommandForm.groupName.trim() || undefined,
        name: quickCommandForm.name.trim(),
        command: quickCommandForm.command.trim(),
        note: quickCommandForm.note.trim() || undefined
      };
      const saved = await window.termira.invoke<BackendQuickCommand>(editingCommandId ? "command.update" : "command.create", payload);
      setQuickCommands((current) => sortQuickCommands([saved, ...current.filter((item) => item.id !== saved.id)]));
      resetQuickCommandForm();
    } catch (error) {
      setCommandError(errorMessage(error));
    } finally {
      setIsSavingCommand(false);
    }
  }

  async function deleteQuickCommand(command: BackendQuickCommand) {
    const accepted = window.confirm(text.tools.commands.confirmDelete(command.name));
    if (!accepted) {
      return;
    }
    setCommandError(null);
    try {
      await window.termira.invoke("command.delete", { id: command.id });
      setQuickCommands((current) => current.filter((item) => item.id !== command.id));
      if (editingCommandId === command.id) {
        resetQuickCommandForm();
      }
    } catch (error) {
      setCommandError(errorMessage(error));
    }
  }

  async function sendQuickCommand(command: BackendQuickCommand) {
    if (!activeTerminal.sessionId || !activeTerminal.channelId || activeTerminal.status !== "connected") {
      setCommandError(text.tools.commands.unavailable);
      return;
    }
    setCommandError(null);
    try {
      await window.termira.invoke("command.sendToTerminal", {
        sessionId: activeTerminal.sessionId,
        channelId: activeTerminal.channelId,
        commandId: command.id
      });
    } catch (error) {
      setCommandError(errorMessage(error));
    }
  }

  async function loadSftpPath(path = sftpPath, sessionIdOverride?: string) {
    const sessionId = sessionIdOverride ?? activeTerminal.sessionId;
    if (!sessionId || activeTerminal.status !== "connected") {
      setSftpError(text.tools.files.noSession);
      return;
    }

    setIsSftpLoading(true);
    setSftpError(null);
    try {
      const opened = await window.termira.invoke<SftpOpenResult>("sftp.open", {
        sessionId,
        path: path || "~"
      });
      const result = await window.termira.invoke<SftpListResult>("sftp.list", {
        sessionId,
        path: opened.path
      });
      setSftpSessionId(result.sessionId);
      setSftpPath(result.path);
      setSftpPathInput(result.path);
      setSftpParentPath(result.parentPath);
      setSftpEntries(result.entries);
      setSelectedSftpPath("");
      setSftpDragTargetPath(null);
      setIsCreatingSftpDirectory(false);
      setNewSftpDirectoryName("");
      setRenamingSftpPath("");
      setSftpRenameName("");
    } catch (error) {
      setSftpError(errorMessage(error));
    } finally {
      setIsSftpLoading(false);
    }
  }

  function upsertSftpTransfer(transfer: SftpTransfer) {
    setSftpTransfers((current) => {
      const withoutCurrent = current.filter((item) => item.transferId !== transfer.transferId);
      return [transfer, ...withoutCurrent].slice(0, 24);
    });
  }

  function scheduleSftpRefresh(path: string, delayMs = 160) {
    const normalizedPath = path || "~";
    const existingTimer = sftpRefreshTimersRef.current.get(normalizedPath);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    const timer = window.setTimeout(() => {
      sftpRefreshTimersRef.current.delete(normalizedPath);
      sftpRefreshRef.current(normalizedPath);
    }, delayMs);
    sftpRefreshTimersRef.current.set(normalizedPath, timer);
  }

  function openSftpEntry(entry: SftpFileEntry) {
    setSelectedSftpPath(entry.path);
    if (entry.directory) {
      void loadSftpPath(entry.path);
    }
  }

  function submitSftpPathInput() {
    const nextPath = sftpPathInput.trim();
    if (!nextPath || nextPath === sftpPath) {
      setSftpPathInput(sftpPath);
      return;
    }
    void loadSftpPath(nextPath);
  }

  function startCreatingSftpDirectory() {
    if (!activeTerminal.sessionId || activeTerminal.status !== "connected") {
      setSftpError(text.tools.files.noSession);
      return;
    }
    setSelectedSftpPath("");
    setRenamingSftpPath("");
    setSftpRenameName("");
    setSftpError(null);
    setNewSftpDirectoryName("");
    setIsCreatingSftpDirectory(true);
  }

  function cancelCreatingSftpDirectory() {
    setIsCreatingSftpDirectory(false);
    setNewSftpDirectoryName("");
  }

  async function createSftpDirectory(event?: FormEvent) {
    event?.preventDefault();
    const name = newSftpDirectoryName.trim();
    if (!name || name.includes("/")) {
      setSftpError(text.tools.files.folderNameRequired);
      return;
    }
    const created = await runSftpOperation(() =>
      window.termira.invoke("sftp.mkdir", {
        sessionId: activeTerminal.sessionId,
        path: joinRemotePath(sftpPath, name)
      })
    );
    if (!created) {
      return;
    }
    setIsCreatingSftpDirectory(false);
    setNewSftpDirectoryName("");
  }

  function startRenamingSftpEntry() {
    if (!selectedSftpEntry) {
      return;
    }
    setIsCreatingSftpDirectory(false);
    setNewSftpDirectoryName("");
    setSftpError(null);
    setRenamingSftpPath(selectedSftpEntry.path);
    setSftpRenameName(selectedSftpEntry.name);
  }

  function cancelRenamingSftpEntry() {
    setRenamingSftpPath("");
    setSftpRenameName("");
  }

  function changeSftpSort(key: SftpSortKey) {
    setSftpSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  async function renameSftpEntry(event?: FormEvent) {
    event?.preventDefault();
    const entry = sftpEntries.find((item) => item.path === renamingSftpPath) ?? selectedSftpEntry;
    if (!entry) {
      return;
    }
    const name = sftpRenameName.trim();
    if (!name || name.includes("/")) {
      setSftpError(text.tools.files.renameNameRequired);
      return;
    }
    if (name === entry.name) {
      cancelRenamingSftpEntry();
      return;
    }
    const targetPath = joinRemotePath(sftpPath, name);
    const renamed = await runSftpOperation(() =>
      window.termira.invoke("sftp.rename", {
        sessionId: activeTerminal.sessionId,
        sourcePath: entry.path,
        targetPath
      })
    );
    if (renamed) {
      cancelRenamingSftpEntry();
      setSelectedSftpPath(targetPath);
    }
  }

  async function removeSftpEntry() {
    if (!selectedSftpEntry) {
      return;
    }
    const accepted = window.confirm(text.tools.files.confirmDelete(selectedSftpEntry.name));
    if (!accepted) {
      return;
    }
    await runSftpOperation(() =>
      window.termira.invoke("sftp.remove", {
        sessionId: activeTerminal.sessionId,
        path: selectedSftpEntry.path,
        directory: selectedSftpEntry.directory
      })
    );
  }

  async function runSftpOperation(operation: () => Promise<unknown>): Promise<boolean> {
    if (!activeTerminal.sessionId) {
      setSftpError(text.tools.files.noSession);
      return false;
    }
    setSftpError(null);
    try {
      await operation();
      await loadSftpPath(sftpPath);
      return true;
    } catch (error) {
      setSftpError(errorMessage(error));
      return false;
    }
  }

  async function uploadSftpFiles(files: FileList | File[] | null, targetDirectory = sftpPath) {
    if (!files || files.length === 0 || !activeTerminal.sessionId) {
      return;
    }
    setSftpError(null);
    for (const file of Array.from(files)) {
      const localPath = window.termira.getPathForFile(file);
      if (!localPath) {
        setSftpError(text.tools.files.localPathUnavailable);
        continue;
      }
      try {
        const transfer = await window.termira.invoke<SftpTransfer>("sftp.upload", {
          sessionId: activeTerminal.sessionId,
          localPath,
          remotePath: joinRemotePath(targetDirectory, file.name)
        });
        sftpUploadTargetsRef.current.set(transfer.transferId, targetDirectory);
        upsertSftpTransfer(transfer);
        if (sameRemotePath(targetDirectory, sftpContextRef.current.path)) {
          scheduleSftpRefresh(targetDirectory, transfer.status === "completed" ? 160 : 900);
        }
      } catch (error) {
        setSftpError(errorMessage(error));
      }
    }
  }

  async function handleUploadSelection(files: FileList | null) {
    await uploadSftpFiles(files, sftpPath);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
    }
  }

  function canAcceptSftpDrop(event: ReactDragEvent<HTMLElement>): boolean {
    return Boolean(isSftpAvailable && activeTerminal.sessionId && Array.from(event.dataTransfer.types).includes("Files"));
  }

  function handleSftpDragOver(event: ReactDragEvent<HTMLElement>, targetDirectory: string) {
    if (!canAcceptSftpDrop(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setSftpDragTargetPath(targetDirectory);
  }

  function handleSftpDragLeave(event: ReactDragEvent<HTMLElement>) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    setSftpDragTargetPath(null);
  }

  async function handleSftpDrop(event: ReactDragEvent<HTMLElement>, targetDirectory: string) {
    if (!canAcceptSftpDrop(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSftpDragTargetPath(null);
    await uploadSftpFiles(event.dataTransfer.files, targetDirectory);
  }

  async function downloadSftpEntry() {
    if (!selectedSftpEntry || selectedSftpEntry.directory || !activeTerminal.sessionId) {
      return;
    }
    const targetPath = window.prompt(text.tools.files.downloadPrompt, `~/Downloads/${selectedSftpEntry.name}`);
    if (!targetPath?.trim()) {
      return;
    }
    setSftpError(null);
    try {
      const transfer = await window.termira.invoke<SftpTransfer>("sftp.download", {
        sessionId: activeTerminal.sessionId,
        remotePath: selectedSftpEntry.path,
        localPath: targetPath.trim()
      });
      upsertSftpTransfer(transfer);
    } catch (error) {
      setSftpError(errorMessage(error));
    }
  }

  async function cancelSftpTransfer(transfer: SftpTransfer) {
    try {
      const nextTransfer = await window.termira.invoke<SftpTransfer>("sftp.cancelTransfer", {
        transferId: transfer.transferId
      });
      upsertSftpTransfer(nextTransfer);
    } catch (error) {
      setSftpError(errorMessage(error));
    }
  }

  async function retrySftpTransfer(transfer: SftpTransfer) {
    if (!activeTerminal.sessionId) {
      setSftpError(text.tools.files.noSession);
      return;
    }
    setSftpError(null);
    try {
      const nextTransfer =
        transfer.direction === "upload"
          ? await window.termira.invoke<SftpTransfer>("sftp.upload", {
              sessionId: activeTerminal.sessionId,
              localPath: transfer.localPath,
              remotePath: transfer.remotePath
            })
          : await window.termira.invoke<SftpTransfer>("sftp.download", {
              sessionId: activeTerminal.sessionId,
              remotePath: transfer.remotePath,
              localPath: transfer.localPath
            });
      upsertSftpTransfer(nextTransfer);
    } catch (error) {
      setSftpError(errorMessage(error));
    }
  }

  async function loadForwardRules(profileId = forwardProfileId) {
    if (!profileId) {
      setForwardRules([]);
      setForwardError(null);
      setIsForwardLoading(false);
      return;
    }
    setIsForwardLoading(true);
    setForwardError(null);
    try {
      const rules = await window.termira.invoke<BackendForwardRule[]>("forward.list", { profileId });
      setForwardRules(sortForwardRules(rules));
    } catch (error) {
      setForwardError(errorMessage(error));
    } finally {
      setIsForwardLoading(false);
    }
  }

  function upsertForwardRule(rule: BackendForwardRule) {
    setForwardRules((current) => {
      const next = current.some((item) => item.id === rule.id)
        ? current.map((item) => (item.id === rule.id ? rule : item))
        : [rule, ...current];
      return sortForwardRules(next);
    });
  }

  function setForwardFormField<Key extends keyof ForwardFormState>(field: Key, value: ForwardFormState[Key]) {
    setForwardForm((current) => ({ ...current, [field]: value }));
  }

  function resetForwardForm() {
    setForwardForm(defaultForwardForm);
    setEditingForwardId("");
    setForwardError(null);
  }

  function editForwardRule(rule: BackendForwardRule) {
    setEditingForwardId(rule.id);
    setForwardForm({
      name: rule.name,
      type: rule.type,
      bindHost: rule.bindHost,
      bindPort: String(rule.bindPort),
      targetHost: rule.targetHost ?? "127.0.0.1",
      targetPort: rule.targetPort == null ? "" : String(rule.targetPort),
      autoStart: rule.autoStart
    });
    setForwardError(null);
  }

  async function submitForwardRule(event?: FormEvent) {
    event?.preventDefault();
    if (!forwardProfileId) {
      setForwardError(text.tools.forwards.noProfile);
      return;
    }
    const bindPort = parseForwardPort(forwardForm.bindPort);
    const targetPort = parseForwardPort(forwardForm.targetPort);
    const needsTarget = forwardForm.type !== "dynamic";
    if (!forwardForm.name.trim()) {
      setForwardError(text.tools.forwards.nameRequired);
      return;
    }
    if (!forwardForm.bindHost.trim() || bindPort == null) {
      setForwardError(text.tools.forwards.portInvalid);
      return;
    }
    if (needsTarget && (!forwardForm.targetHost.trim() || targetPort == null)) {
      setForwardError(text.tools.forwards.targetRequired);
      return;
    }

    setIsSavingForward(true);
    setForwardError(null);
    try {
      const payload = {
        id: editingForwardId || undefined,
        profileId: forwardProfileId,
        name: forwardForm.name.trim(),
        type: forwardForm.type,
        bindHost: forwardForm.bindHost.trim(),
        bindPort,
        targetHost: needsTarget ? forwardForm.targetHost.trim() : undefined,
        targetPort: needsTarget ? targetPort : undefined,
        autoStart: forwardForm.autoStart
      };
      const saved = await window.termira.invoke<BackendForwardRule>(editingForwardId ? "forward.update" : "forward.create", payload);
      upsertForwardRule(saved);
      resetForwardForm();
    } catch (error) {
      setForwardError(errorMessage(error));
    } finally {
      setIsSavingForward(false);
    }
  }

  async function startForwardRule(rule: BackendForwardRule) {
    if (!activeTerminal.sessionId || !isForwardSessionAvailable) {
      setForwardError(text.tools.forwards.noSession);
      return;
    }
    setForwardError(null);
    try {
      const nextRule = await window.termira.invoke<BackendForwardRule>("forward.start", {
        id: rule.id,
        sessionId: activeTerminal.sessionId
      });
      upsertForwardRule(nextRule);
    } catch (error) {
      setForwardError(errorMessage(error));
    }
  }

  async function stopForwardRule(rule: BackendForwardRule) {
    setForwardError(null);
    try {
      const nextRule = await window.termira.invoke<BackendForwardRule>("forward.stop", { id: rule.id });
      upsertForwardRule(nextRule);
    } catch (error) {
      setForwardError(errorMessage(error));
    }
  }

  async function deleteForwardRule(rule: BackendForwardRule) {
    const accepted = window.confirm(text.tools.forwards.confirmDelete(rule.name));
    if (!accepted) {
      return;
    }
    setForwardError(null);
    try {
      await window.termira.invoke("forward.delete", { id: rule.id });
      setForwardRules((current) => current.filter((item) => item.id !== rule.id));
      if (editingForwardId === rule.id) {
        resetForwardForm();
      }
    } catch (error) {
      setForwardError(errorMessage(error));
    }
  }

  function openHostFromHostList(host: HostItem) {
    const reusableTabId = activeView === "terminal" && isHostPickerActive ? activeTerminal.id : undefined;
    void openTerminalForHost(host, reusableTabId, { dedupeOpening: !reusableTabId });
  }

  function renderHostCards(items: HostItem[], options: { embedded?: boolean } = {}) {
    if (items.length === 0) {
      return <p className="empty-copy">{text.hosts.empty}</p>;
    }

    return items.map((host) => {
      const address = formatHostAddress(host);
      const tone = hostStatusTone[host.status];
      const isSelected = selectedHostId === host.id;

      return (
        <article
          key={host.id}
          className={`host-card ${isSelected ? "is-active" : ""}`}
        >
          <button
            className="host-card-main"
            type="button"
            title={text.hosts.doubleClickConnect}
            onClick={() => selectHost(host.id, { preserveView: options.embedded })}
            onDoubleClick={(event) => {
              event.stopPropagation();
              openHostFromHostList(host);
            }}
          >
            <span className={`host-card-icon host-row-icon--${tone}`}>
              <Server size={18} aria-hidden="true" />
            </span>
            <span className="host-card-copy">
              <strong title={translate(host.name, language)}>{translate(host.name, language)}</strong>
              <small title={address}>ssh, {host.user}</small>
            </span>
            <span className={`host-card-status host-row-status--${tone}`}>{text.hosts.statusLabels[host.status]}</span>
          </button>
          <span className="host-card-actions">
            <button
              className="host-card-action"
              type="button"
              title={text.hosts.editHost}
              aria-label={text.hosts.editHost}
              onClick={(event) => {
                event.stopPropagation();
                openEditHostEditor(host.id);
              }}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
            <button
              className="host-card-action host-card-action--danger"
              type="button"
              title={text.hosts.deleteHost}
              aria-label={text.hosts.deleteHost}
              onClick={(event) => {
                event.stopPropagation();
                void deleteHost(host);
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </span>
        </article>
      );
    });
  }

  function renderHostsHome(options: { embedded?: boolean } = {}) {
    const canConnectSelected = selectedHost.id !== "__placeholder" && selectedHost.status !== "connecting";

    return (
      <section className={`hosts-home ${options.embedded ? "hosts-home--embedded" : ""}`} aria-label={text.hosts.sidebarTitle}>
        <div className="hosts-home-toolbar">
          <label className="search-box hosts-home-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={hostSearch}
              placeholder={text.hosts.searchPlaceholder}
              onChange={(event) => setHostSearch(event.target.value)}
            />
          </label>
          <button
            className="button button--compact"
            type="button"
            disabled={!canConnectSelected}
            onClick={() => openHostFromHostList(selectedHost)}
          >
            <Play size={14} aria-hidden="true" />
            <span>{text.hosts.connectSelected}</span>
          </button>
        </div>

        <div className="hosts-home-actions">
          <button className="button button--compact button--accent" type="button" onClick={openCreateHostEditor}>
            <Plus size={15} aria-hidden="true" />
            <span>{text.hosts.newHost}</span>
          </button>
          <button
            className="button button--compact"
            type="button"
            disabled={!canConnectSelected}
            onClick={() => openHostFromHostList(selectedHost)}
          >
            <Terminal size={15} aria-hidden="true" />
            <span>{text.terminal.tabLabel}</span>
          </button>
        </div>

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

        <section className="hosts-home-board">
          <div className="hosts-home-heading">
            <h2>{text.hosts.homeTitle}</h2>
            <span>{text.hosts.hostCount(visibleHosts.length)}</span>
          </div>
          <div className="host-card-grid">{renderHostCards(visibleHosts, { embedded: options.embedded })}</div>
        </section>
      </section>
    );
  }

  function beginToolDockResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (isToolDockCollapsed || isHostPickerActive || isTerminalMaximized) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = toolDockWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setIsToolDockResizing(true);

    const finishResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setIsToolDockResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setToolDockWidth(clampToolDockWidth(startWidth + startX - moveEvent.clientX));
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
  }

  function handleToolDockResizeKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setToolDockWidth((width) => clampToolDockWidth(width + 24));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setToolDockWidth((width) => clampToolDockWidth(width - 24));
    }
  }

  function beginSftpQueueResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = sftpQueueHeight;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    setIsSftpQueueResizing(true);

    const finishResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setIsSftpQueueResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setSftpQueueHeight(clampSftpQueueHeight(startHeight + startY - moveEvent.clientY));
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
  }

  function handleSftpQueueResizeKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSftpQueueHeight((height) => clampSftpQueueHeight(height + 24));
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSftpQueueHeight((height) => clampSftpQueueHeight(height - 24));
    }
  }

  function renderFilesPanel() {
    const canUseFiles = isSftpAvailable && Boolean(activeTerminal.sessionId);
    const canDownload = Boolean(selectedSftpEntry && !selectedSftpEntry.directory);
    const canMutate = Boolean(selectedSftpEntry);
    const queueStyle = { "--sftp-queue-height": `${sftpQueueHeight}px` } as CSSProperties;
    const renderSortButton = (key: SftpSortKey, label: string) => {
      const isActive = sftpSort.key === key;
      const Icon = isActive && sftpSort.direction === "desc" ? ArrowDown : ArrowUp;
      return (
        <button
          className={`file-sort-button ${isActive ? "is-active" : ""}`}
          type="button"
          aria-label={text.tools.files.sortBy(label)}
          onClick={() => changeSftpSort(key)}
        >
          <span>{label}</span>
          {isActive ? <Icon size={13} aria-hidden="true" /> : null}
        </button>
      );
    };

    return (
      <div className="tool-content tool-content--files">
        <div className="sftp-browser-head">
          <div className="tool-path">
            <FolderOpen size={15} aria-hidden="true" />
            <input
              value={canUseFiles ? sftpPathInput : text.tools.files.noSession}
              title={canUseFiles ? sftpPath : text.tools.files.noSession}
              aria-label={text.tools.files.pathInput}
              disabled={!canUseFiles}
              spellCheck={false}
              onChange={(event) => setSftpPathInput(event.currentTarget.value)}
              onBlur={() => setSftpPathInput(sftpPath)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitSftpPathInput();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setSftpPathInput(sftpPath);
                  event.currentTarget.blur();
                }
              }}
            />
          </div>

          <div className="icon-toolbar" aria-label={text.tools.files.toolbar}>
            <button
              className="icon-button"
              type="button"
              title={text.tools.files.up}
              aria-label={text.tools.files.up}
              disabled={!canUseFiles || !sftpParentPath || sftpPath === sftpParentPath}
              onClick={() => void loadSftpPath(sftpParentPath)}
            >
              <ArrowUp size={15} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              title={text.actions.refresh}
              aria-label={text.actions.refresh}
              disabled={!canUseFiles || isSftpLoading}
              onClick={() => void loadSftpPath(sftpPath)}
            >
              {isSftpLoading ? <Loader2 className="spin-icon" size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
            </button>
            <button
              className="icon-button"
              type="button"
              title={text.tools.files.followTerminalCwd}
              aria-label={text.tools.files.followTerminalCwd}
              disabled={!canUseFiles || !activeTerminal.cwd}
              onClick={() => void loadSftpPath(activeTerminal.cwd || "~")}
            >
              <Terminal size={15} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              title={text.tools.files.upload}
              aria-label={text.tools.files.upload}
              disabled={!canUseFiles}
              onClick={() => uploadInputRef.current?.click()}
            >
              <Upload size={15} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              title={text.tools.files.download}
              aria-label={text.tools.files.download}
              disabled={!canUseFiles || !canDownload}
              onClick={() => void downloadSftpEntry()}
            >
              <Download size={15} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              title={text.tools.files.mkdir}
              aria-label={text.tools.files.mkdir}
              disabled={!canUseFiles}
              onClick={startCreatingSftpDirectory}
            >
              <FolderPlus size={15} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              title={text.tools.files.rename}
              aria-label={text.tools.files.rename}
              disabled={!canUseFiles || !canMutate}
              onClick={startRenamingSftpEntry}
            >
              <Pencil size={15} aria-hidden="true" />
            </button>
            <button
              className="icon-button icon-button--danger"
              type="button"
              title={text.tools.files.delete}
              aria-label={text.tools.files.delete}
              disabled={!canUseFiles || !canMutate}
              onClick={() => void removeSftpEntry()}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
            <input
              ref={uploadInputRef}
              className="visually-hidden"
              type="file"
              multiple
              tabIndex={-1}
              onChange={(event) => void handleUploadSelection(event.currentTarget.files)}
            />
          </div>

          {!canUseFiles ? (
            <div className="inline-state">
              <FolderOpen size={15} aria-hidden="true" />
              <span>{text.tools.files.noSession}</span>
            </div>
          ) : null}

          {sftpError ? (
            <div className="inline-state inline-state--error">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>{sftpError}</span>
            </div>
          ) : null}
        </div>

	        <div
	          className={`file-table ${sftpDragTargetPath ? "is-dragging" : ""} ${sftpDragTargetPath === sftpPath ? "is-drop-target" : ""}`}
	          aria-label={text.tools.files.list}
	          onDragOver={(event) => handleSftpDragOver(event, sftpPath)}
	          onDragLeave={handleSftpDragLeave}
	          onDrop={(event) => void handleSftpDrop(event, sftpPath)}
	        >
	          {sftpDragTargetPath ? (
	            <div className="file-drop-indicator" aria-live="polite">
	              <Upload size={15} aria-hidden="true" />
	              <span>{sftpDragTargetPath === sftpPath ? text.tools.files.dropUploadHere : text.tools.files.dropUploadIntoFolder}</span>
	            </div>
	          ) : null}
	          <div className="file-row file-row--head">
	            {renderSortButton("name", text.tools.files.name)}
	            {renderSortButton("modified", text.tools.files.modified)}
	            {renderSortButton("size", text.tools.files.size)}
	            {renderSortButton("permissions", text.tools.files.kind)}
	          </div>
	          {canUseFiles && sftpPath !== "/" && sftpParentPath ? (
	            <button
	              className="file-row file-row--parent"
	              type="button"
	              title={sftpParentPath}
	              onClick={() => void loadSftpPath(sftpParentPath)}
	            >
	              <span className="file-name">
	                <Folder size={15} aria-hidden="true" />
	                <span>..</span>
	              </span>
	              <span className="file-cell file-cell--muted">-</span>
	              <span className="file-cell file-cell--muted">-</span>
	              <span className="file-cell">{text.tools.files.parentFolder}</span>
	            </button>
	          ) : null}
	          {isCreatingSftpDirectory ? (
	            <form className="file-row file-row--create" onSubmit={(event) => void createSftpDirectory(event)}>
	              <span className="file-name">
	                <Folder size={15} aria-hidden="true" />
	                <input
	                  ref={newSftpDirectoryInputRef}
	                  value={newSftpDirectoryName}
	                  placeholder={text.tools.files.newFolderPlaceholder}
	                  onChange={(event) => setNewSftpDirectoryName(event.currentTarget.value)}
	                  onKeyDown={(event) => {
	                    if (event.key === "Escape") {
	                      event.preventDefault();
	                      cancelCreatingSftpDirectory();
	                    }
	                  }}
	                />
	              </span>
	              <span className="file-create-actions">
	                <button className="icon-button" type="submit" title={text.tools.files.create} aria-label={text.tools.files.create}>
	                  <Check size={14} aria-hidden="true" />
	                </button>
	                <button className="icon-button" type="button" title={text.hostEditor.cancel} aria-label={text.hostEditor.cancel} onClick={cancelCreatingSftpDirectory}>
	                  <X size={14} aria-hidden="true" />
	                </button>
              </span>
            </form>
          ) : null}
	          {isSftpLoading ? (
	            <div className="file-row file-row--state">
	              <span>
                <Loader2 className="spin-icon" size={14} aria-hidden="true" />
                {text.tools.files.loading}
              </span>
            </div>
          ) : sortedSftpEntries.length > 0 ? (
            sortedSftpEntries.map((entry) =>
              entry.path === renamingSftpPath ? (
                <form key={entry.path} className="file-row file-row--create file-row--rename" onSubmit={(event) => void renameSftpEntry(event)}>
                  <span className="file-name">
                    {entry.directory ? <Folder size={15} aria-hidden="true" /> : <FileIcon size={15} aria-hidden="true" />}
                    <input
                      ref={renameSftpInputRef}
                      value={sftpRenameName}
                      placeholder={text.tools.files.renamePrompt}
                      onChange={(event) => setSftpRenameName(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRenamingSftpEntry();
                        }
                      }}
                    />
                  </span>
                  <span className="file-create-actions">
                    <button className="icon-button" type="submit" title={text.tools.files.rename} aria-label={text.tools.files.rename}>
                      <Check size={14} aria-hidden="true" />
                    </button>
                    <button className="icon-button" type="button" title={text.hostEditor.cancel} aria-label={text.hostEditor.cancel} onClick={cancelRenamingSftpEntry}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </span>
                </form>
              ) : (
                <button
                  key={entry.path}
                  className={`file-row ${selectedSftpPath === entry.path ? "is-active" : ""} ${
                    entry.directory && sftpDragTargetPath === entry.path ? "file-row--drop-target" : ""
                  }`}
                  type="button"
                  title={entry.path}
                  onClick={() => setSelectedSftpPath(entry.path)}
                  onDoubleClick={() => openSftpEntry(entry)}
                  onDragOver={entry.directory ? (event) => handleSftpDragOver(event, entry.path) : undefined}
                  onDragLeave={entry.directory ? handleSftpDragLeave : undefined}
                  onDrop={entry.directory ? (event) => void handleSftpDrop(event, entry.path) : undefined}
                >
                  <span className="file-name">
                    {entry.directory ? <Folder size={15} aria-hidden="true" /> : <FileIcon size={15} aria-hidden="true" />}
                    <span>{entry.name}</span>
                  </span>
                  <span className="file-cell">{formatRemoteTime(entry.modifiedAt)}</span>
                  <span className="file-cell">{entry.directory ? "-" : formatBytes(entry.size)}</span>
                  <span className="file-cell">{entry.directory ? text.tools.files.folderType : entry.permissions}</span>
                </button>
              )
            )
          ) : (
            <div className="file-row file-row--state">
              <span>{canUseFiles ? text.tools.files.empty : text.tools.files.noSession}</span>
            </div>
          )}
        </div>

	        <section
	          className={`subpanel subpanel--queue ${isSftpQueueResizing ? "is-resizing" : ""}`}
	          aria-label={text.tools.files.queue}
	          style={queueStyle}
	        >
	          <button
	            className="queue-resize-handle"
	            type="button"
	            role="separator"
	            aria-orientation="horizontal"
	            aria-label={text.tools.files.resizeQueue}
	            title={text.tools.files.resizeQueue}
	            aria-valuemin={MIN_SFTP_QUEUE_HEIGHT}
	            aria-valuemax={MAX_SFTP_QUEUE_HEIGHT}
	            aria-valuenow={sftpQueueHeight}
	            onPointerDown={beginSftpQueueResize}
	            onKeyDown={handleSftpQueueResizeKeyDown}
	          />
          <div className="subpanel-heading">
            <span>{text.tools.files.queue}</span>
            <strong className={`queue-count ${sftpTransfers.length === 0 ? "queue-count--idle" : ""}`}>
              {sftpTransfers.length > 0 ? text.tools.files.queueCount(sftpTransfers.length) : text.tools.files.queueIdle}
            </strong>
          </div>
          <div className={`queue-list ${sftpTransfers.length === 0 ? "queue-list--empty" : ""}`}>
            {sftpTransfers.length > 0 ? (
              sftpTransfers.map((transfer) => (
                <article
                  key={transfer.transferId}
                  className={`queue-item ${
                    transfer.status === "failed" || transfer.status === "cancelled" ? "queue-item--failed" : ""
                  }`}
                >
                  <div className="queue-main">
                    <span title={transfer.remotePath}>
                      {transfer.direction === "upload" ? <Upload size={13} aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
                      {transfer.fileName}
                    </span>
                    <strong>{text.tools.files.transferStatus[transfer.status]}</strong>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${Math.max(0, Math.min(100, transfer.percent))}%` }} />
                  </div>
                  <div className="queue-foot">
                    <small>
                      {formatBytes(transfer.bytesTransferred)} / {formatBytes(transfer.totalBytes)}
                    </small>
                    <span>
                      {transfer.status === "queued" || transfer.status === "running" ? (
                        <button
                          className="icon-button"
                          type="button"
                          title={text.tools.files.cancel}
                          aria-label={text.tools.files.cancel}
                          onClick={() => void cancelSftpTransfer(transfer)}
                        >
                          <Ban size={13} aria-hidden="true" />
                        </button>
                      ) : null}
                      {transfer.status === "failed" || transfer.status === "cancelled" ? (
                        <button
                          className="icon-button"
                          type="button"
                          title={text.tools.files.retry}
                          aria-label={text.tools.files.retry}
                          onClick={() => void retrySftpTransfer(transfer)}
                        >
                          <RotateCcw size={13} aria-hidden="true" />
                        </button>
                      ) : null}
                      {transfer.status === "completed" ? <Check size={14} aria-hidden="true" /> : null}
                    </span>
                  </div>
                  {transfer.errorMessage ? <small className="queue-error">{transfer.errorMessage}</small> : null}
                </article>
              ))
            ) : (
              <div className="queue-empty-state">
                <span>{text.tools.files.queueEmpty}</span>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderForwardsPanel() {
    const canUseProfile = Boolean(forwardProfileId);
    const canStartRules = Boolean(isForwardSessionAvailable && activeTerminal.sessionId);
    const isEditing = Boolean(editingForwardId);

    return (
      <div className="tool-content tool-content--forwards">
        <form className="forward-form" onSubmit={(event) => void submitForwardRule(event)}>
          <div className="subpanel-heading">
            <span>{isEditing ? text.tools.forwards.editTitle : text.tools.forwards.formTitle}</span>
            <button className="button button--compact" type="button" disabled={!isEditing && forwardForm === defaultForwardForm} onClick={resetForwardForm}>
              <X size={14} aria-hidden="true" />
              <span>{text.tools.forwards.cancelEdit}</span>
            </button>
          </div>

          <div className="forward-grid">
            <label className="form-field form-field--wide">
              <span>{text.tools.forwards.name}</span>
              <input
                value={forwardForm.name}
                disabled={!canUseProfile || isSavingForward}
                onChange={(event) => setForwardFormField("name", event.currentTarget.value)}
              />
            </label>
            <label className="form-field">
              <span>{text.tools.forwards.type}</span>
              <select
                value={forwardForm.type}
                disabled={!canUseProfile || isSavingForward}
                onChange={(event) => setForwardFormField("type", event.currentTarget.value as ForwardType)}
              >
                <option value="local">{text.tools.forwards.typeLabels.local}</option>
                <option value="remote">{text.tools.forwards.typeLabels.remote}</option>
                <option value="dynamic">{text.tools.forwards.typeLabels.dynamic}</option>
              </select>
            </label>
            <label className="form-field">
              <span>{text.tools.forwards.bindHost}</span>
              <input
                value={forwardForm.bindHost}
                disabled={!canUseProfile || isSavingForward}
                spellCheck={false}
                onChange={(event) => setForwardFormField("bindHost", event.currentTarget.value)}
              />
            </label>
            <label className="form-field">
              <span>{text.tools.forwards.bindPort}</span>
              <input
                inputMode="numeric"
                value={forwardForm.bindPort}
                disabled={!canUseProfile || isSavingForward}
                onChange={(event) => setForwardFormField("bindPort", event.currentTarget.value)}
              />
            </label>
            <label className="form-field">
              <span>{text.tools.forwards.targetHost}</span>
              <input
                value={forwardForm.targetHost}
                disabled={!canUseProfile || isSavingForward || forwardForm.type === "dynamic"}
                spellCheck={false}
                onChange={(event) => setForwardFormField("targetHost", event.currentTarget.value)}
              />
            </label>
            <label className="form-field">
              <span>{text.tools.forwards.targetPort}</span>
              <input
                inputMode="numeric"
                value={forwardForm.targetPort}
                disabled={!canUseProfile || isSavingForward || forwardForm.type === "dynamic"}
                onChange={(event) => setForwardFormField("targetPort", event.currentTarget.value)}
              />
            </label>
            <label className="toggle-field form-field--wide">
              <input
                type="checkbox"
                checked={forwardForm.autoStart}
                disabled={!canUseProfile || isSavingForward}
                onChange={(event) => setForwardFormField("autoStart", event.currentTarget.checked)}
              />
              <span>{text.tools.forwards.autoStart}</span>
            </label>
          </div>

          <div className="split-actions">
            <button className="button button--compact button--accent" type="submit" disabled={!canUseProfile || isSavingForward}>
              {isSavingForward ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              <span>{isEditing ? text.tools.forwards.updateRule : text.tools.forwards.saveRule}</span>
            </button>
            <button className="button button--compact" type="button" disabled={isSavingForward} onClick={() => void loadForwardRules(forwardProfileId)}>
              <RefreshCw size={14} aria-hidden="true" />
              <span>{text.actions.refresh}</span>
            </button>
          </div>
        </form>

        {!canUseProfile ? (
          <div className="inline-state">
            <Network size={15} aria-hidden="true" />
            <span>{text.tools.forwards.noProfile}</span>
          </div>
        ) : !canStartRules ? (
          <div className="inline-state">
            <Network size={15} aria-hidden="true" />
            <span>{text.tools.forwards.noSession}</span>
          </div>
        ) : null}

        {forwardError ? (
          <div className="inline-state inline-state--error">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{forwardError}</span>
          </div>
        ) : null}

        <div className="rule-list">
          {isForwardLoading ? (
            <div className="queue-empty-state">
              <Loader2 className="spin-icon" size={14} aria-hidden="true" />
              <span>{text.tools.forwards.loading}</span>
            </div>
          ) : forwardRules.length > 0 ? (
            forwardRules.map((rule) => {
              const canStop = rule.status === "running" || rule.status === "starting";
              const canStart = canStartRules && (rule.status === "stopped" || rule.status === "failed");
              return (
                <article key={rule.id} className={`rule-card ${rule.status === "failed" ? "rule-card--failed" : ""}`}>
                  <div className="rule-card-head">
                    <div>
                      <span>{text.tools.forwards.typeLabels[rule.type]}</span>
                      <strong>{rule.name}</strong>
                    </div>
                    <span className={`state-badge state-badge--${forwardStatusTone[rule.status]}`}>
                      {text.tools.forwards.statusLabels[rule.status]}
                    </span>
                  </div>
                  <div className="rule-route">
                    <code title={formatForwardBind(rule)}>{formatForwardBind(rule)}</code>
                    <span>-&gt;</span>
                    <code title={formatForwardTarget(rule, text)}>{formatForwardTarget(rule, text)}</code>
                  </div>
                  {rule.errorMessage ? <small className="queue-error">{rule.errorMessage}</small> : null}
                  <div className="rule-card-foot">
                    <span title={rule.profileId}>{text.tools.forwards.boundTo(forwardProfile?.name ? translate(forwardProfile.name, language) : rule.profileId)}</span>
                    <span className="rule-actions">
                      <button
                        className="icon-button"
                        type="button"
                        title={text.tools.forwards.start}
                        aria-label={text.tools.forwards.start}
                        disabled={!canStart}
                        onClick={() => void startForwardRule(rule)}
                      >
                        <Play size={14} aria-hidden="true" />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        title={text.tools.forwards.stop}
                        aria-label={text.tools.forwards.stop}
                        disabled={!canStop}
                        onClick={() => void stopForwardRule(rule)}
                      >
                        <Square size={14} aria-hidden="true" />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        title={text.tools.forwards.edit}
                        aria-label={text.tools.forwards.edit}
                        disabled={rule.status === "running" || rule.status === "starting"}
                        onClick={() => editForwardRule(rule)}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        className="icon-button icon-button--danger"
                        type="button"
                        title={text.tools.forwards.delete}
                        aria-label={text.tools.forwards.delete}
                        onClick={() => void deleteForwardRule(rule)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="queue-empty-state">
              <span>{canUseProfile ? text.tools.forwards.empty : text.tools.forwards.noProfile}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderMonitorPanel() {
    const snapshot = monitorSnapshot;
    const canUseMonitor = isMonitorSessionAvailable && Boolean(activeTerminal.sessionId);

    return (
      <div className="tool-content">
        <div className="split-actions">
          <button
            className="button button--compact"
            type="button"
            disabled={!canUseMonitor || isMonitorLoading}
            onClick={() => void refreshMonitorSnapshot()}
          >
            {isMonitorLoading ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
            <span>{text.tools.monitor.refresh}</span>
          </button>
          <span className="queue-count queue-count--idle">{text.tools.monitor.refreshing}</span>
        </div>

        {!canUseMonitor ? (
          <div className="inline-state">
            <Gauge size={15} aria-hidden="true" />
            <span>{text.tools.monitor.noSession}</span>
          </div>
        ) : null}

        {monitorError ? (
          <div className="inline-state inline-state--error">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{monitorError}</span>
          </div>
        ) : null}

        {snapshot?.available ? (
          <>
            <div className="monitor-summary">
              <div>
                <Cpu size={17} aria-hidden="true" />
                <span>CPU</span>
                <strong>{formatPercent(snapshot.cpu?.usagePercent)}</strong>
              </div>
              <div>
                <Gauge size={17} aria-hidden="true" />
                <span>{text.tools.monitor.memory}</span>
                <strong>{formatPercent(snapshot.memory?.usagePercent)}</strong>
              </div>
              <div>
                <Server size={17} aria-hidden="true" />
                <span>{text.tools.monitor.disk}</span>
                <strong>{formatPercent(snapshot.disk?.usagePercent)}</strong>
              </div>
              <div>
                <Network size={17} aria-hidden="true" />
                <span>{text.tools.monitor.network}</span>
                <strong>{formatRate(snapshot.network?.rxRateBytesPerSecond)} / {formatRate(snapshot.network?.txRateBytesPerSecond)}</strong>
              </div>
            </div>

            <div className="metric-stack">
              {renderMetricCard("CPU", snapshot.cpu?.usagePercent ?? 0, text.tools.monitor.cpuDetail)}
              {renderMetricCard(
                text.tools.monitor.memory,
                snapshot.memory?.usagePercent ?? 0,
                `${formatBytes(snapshot.memory?.usedBytes ?? 0)} / ${formatBytes(snapshot.memory?.totalBytes ?? 0)}`
              )}
              {renderMetricCard(
                `${text.tools.monitor.disk} ${snapshot.disk?.path ?? "/"}`,
                snapshot.disk?.usagePercent ?? 0,
                `${formatBytes(snapshot.disk?.usedBytes ?? 0)} / ${formatBytes(snapshot.disk?.totalBytes ?? 0)}`
              )}
              <article className="metric-card metric-card--muted">
                <div className="metric-card-head">
                  <strong>{text.tools.monitor.load}</strong>
                  <small>{snapshot.load ? `${snapshot.load.oneMinute} / ${snapshot.load.fiveMinutes} / ${snapshot.load.fifteenMinutes}` : "-"}</small>
                </div>
                <div className="metric-card-head">
                  <strong>{text.tools.monitor.uptime}</strong>
                  <small>{formatUptime(snapshot.uptimeSeconds)}</small>
                </div>
                <div className="metric-card-head">
                  <strong>{text.tools.monitor.updatedAt}</strong>
                  <small>{formatRemoteTime(snapshot.collectedAt)}</small>
                </div>
              </article>
            </div>
          </>
        ) : !isMonitorLoading ? (
          <div className="queue-empty-state">
            <span>{canUseMonitor ? text.tools.monitor.empty : text.tools.monitor.noSession}</span>
          </div>
        ) : null}
      </div>
    );
  }

  function renderMetricCard(label: string, value: number, detail: string) {
    const tone = value >= 85 ? "bad" : value >= 65 ? "warn" : "muted";
    return (
      <article className={`metric-card metric-card--${tone}`}>
        <div className="metric-card-head">
          <strong>{label}</strong>
          <small>{formatPercent(value)}</small>
        </div>
        <div className="progress-track">
          <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
        </div>
        <small>{detail}</small>
      </article>
    );
  }

  function renderProcessesPanel() {
    const canUseProcesses = isProcessSessionAvailable && Boolean(activeTerminal.sessionId);
    const renderSortButton = (key: ProcessSortKey, label: string) => {
      const isActive = processSort.key === key;
      const Icon = isActive && processSort.direction === "desc" ? ArrowDown : ArrowUp;
      return (
        <button
          className={`file-sort-button ${isActive ? "is-active" : ""}`}
          type="button"
          aria-label={text.tools.processes.sortBy(label)}
          onClick={() => changeProcessSort(key)}
        >
          <span>{label}</span>
          {isActive ? <Icon size={13} aria-hidden="true" /> : null}
        </button>
      );
    };

    return (
      <div className="tool-content tool-content--processes">
        <div className="split-actions">
          <label className="search-box search-box--compact process-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={processSearch}
              placeholder={text.tools.processes.searchPlaceholder}
              onChange={(event) => setProcessSearch(event.currentTarget.value)}
            />
          </label>
          <button
            className="button button--compact"
            type="button"
            disabled={!canUseProcesses || isProcessLoading}
            onClick={() => void loadProcessList(activeTerminal.sessionId)}
          >
            {isProcessLoading ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
            <span>{text.actions.refresh}</span>
          </button>
        </div>

        {!canUseProcesses ? (
          <div className="inline-state">
            <Cpu size={15} aria-hidden="true" />
            <span>{text.tools.processes.noSession}</span>
          </div>
        ) : null}

        {processError ? (
          <div className="inline-state inline-state--error">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{processError}</span>
          </div>
        ) : null}

        <div className="process-table" aria-label={text.tools.processes.title}>
          <div className="process-row process-row--head">
            {renderSortButton("pid", "PID")}
            {renderSortButton("cpu", "CPU")}
            {renderSortButton("memory", "MEM")}
            {renderSortButton("name", text.tools.processes.command)}
            <span />
          </div>
          {isProcessLoading ? (
            <div className="process-row process-row--state">
              <span>
                <Loader2 className="spin-icon" size={14} aria-hidden="true" />
                {text.tools.processes.loading}
              </span>
            </div>
          ) : sortedProcessEntries.length > 0 ? (
            sortedProcessEntries.map((process) => (
              <div
                key={`${process.pid}-${process.command}`}
                className={`process-row ${process.cpuPercent >= 50 ? "process-row--hot" : ""} ${process.user === "root" ? "process-row--system" : ""}`}
                title={process.command}
              >
                <span>{process.pid}</span>
                <span>{formatPercent(process.cpuPercent)}</span>
                <span>{formatPercent(process.memoryPercent)}</span>
                <span>
                  <strong>{process.name}</strong>
                  <small>{process.command}</small>
                </span>
                <button
                  className="icon-button icon-button--danger"
                  type="button"
                  title={text.tools.processes.kill}
                  aria-label={text.tools.processes.kill}
                  disabled={!canUseProcesses || killingProcessPid === process.pid}
                  onClick={() => void killProcess(process)}
                >
                  {killingProcessPid === process.pid ? <Loader2 className="spin-icon" size={13} aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />}
                </button>
              </div>
            ))
          ) : (
            <div className="process-row process-row--state">
              <span>{canUseProcesses ? text.tools.processes.empty : text.tools.processes.noSession}</span>
            </div>
          )}
        </div>
        <span className="queue-count queue-count--idle">{text.tools.processes.loaded(sortedProcessEntries.length)}</span>
      </div>
    );
  }

  function renderCommandsPanel() {
    const canSendCommands = isCommandSessionAvailable;
    const isEditing = Boolean(editingCommandId);

    return (
      <div className="tool-content">
        <form className="forward-form command-form" onSubmit={(event) => void submitQuickCommand(event)}>
          <div className="subpanel-heading">
            <span>{isEditing ? text.tools.commands.editCommand : text.tools.commands.newCommand}</span>
            <button className="button button--compact" type="button" disabled={!isEditing && quickCommandForm === defaultQuickCommandForm} onClick={resetQuickCommandForm}>
              <X size={14} aria-hidden="true" />
              <span>{text.tools.forwards.cancelEdit}</span>
            </button>
          </div>
          <div className="forward-grid">
            <label className="form-field">
              <span>{text.tools.commands.name}</span>
              <input
                value={quickCommandForm.name}
                disabled={isSavingCommand}
                onChange={(event) => setQuickCommandFormField("name", event.currentTarget.value)}
              />
            </label>
            <label className="form-field">
              <span>{text.tools.commands.group}</span>
              <input
                value={quickCommandForm.groupName}
                disabled={isSavingCommand}
                onChange={(event) => setQuickCommandFormField("groupName", event.currentTarget.value)}
              />
            </label>
            <label className="form-field form-field--wide">
              <span>{text.tools.commands.content}</span>
              <textarea
                value={quickCommandForm.command}
                disabled={isSavingCommand}
                spellCheck={false}
                onChange={(event) => setQuickCommandFormField("command", event.currentTarget.value)}
              />
            </label>
            <label className="form-field form-field--wide">
              <span>{text.tools.commands.note}</span>
              <input
                value={quickCommandForm.note}
                disabled={isSavingCommand}
                onChange={(event) => setQuickCommandFormField("note", event.currentTarget.value)}
              />
            </label>
            <label className="toggle-field form-field--wide">
              <input
                type="checkbox"
                checked={quickCommandForm.profileScoped}
                disabled={isSavingCommand || !forwardProfileId}
                onChange={(event) => setQuickCommandFormField("profileScoped", event.currentTarget.checked)}
              />
              <span>{text.tools.commands.profileScoped}</span>
            </label>
          </div>
          <div className="split-actions">
            <button className="button button--compact button--accent" type="submit" disabled={isSavingCommand}>
              {isSavingCommand ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              <span>{isEditing ? text.tools.commands.updateCommand : text.tools.commands.saveCommand}</span>
            </button>
            <button className="button button--compact" type="button" disabled={isCommandLoading} onClick={() => void loadQuickCommands(forwardProfileId)}>
              <RefreshCw size={14} aria-hidden="true" />
              <span>{text.actions.refresh}</span>
            </button>
          </div>
        </form>

        {!canSendCommands ? (
          <div className="inline-state">
            <Zap size={15} aria-hidden="true" />
            <span>{text.tools.commands.unavailable}</span>
          </div>
        ) : null}

        {commandError ? (
          <div className="inline-state inline-state--error">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{commandError}</span>
          </div>
        ) : null}

        <div className="command-list">
          {isCommandLoading ? (
            <div className="queue-empty-state">
              <Loader2 className="spin-icon" size={14} aria-hidden="true" />
              <span>{text.tools.commands.loading}</span>
            </div>
          ) : groupedQuickCommands.length > 0 ? (
            groupedQuickCommands.map((group) => (
              <section key={group.groupName || "__default"} className="command-group">
                <div className="subpanel-heading">
                  <span>{group.groupName || text.tools.commands.defaultGroup}</span>
                  <strong className="queue-count queue-count--idle">{group.commands.length}</strong>
                </div>
                {group.commands.map((command) => (
                  <article key={command.id} className="command-card">
                    <div className="command-card-head">
                      <div>
                        <span>{command.profileId ? text.tools.commands.hostScoped : text.tools.commands.globalScoped}</span>
                        <strong>{command.name}</strong>
                      </div>
                      <span className="rule-actions">
                        <button
                          className="icon-button"
                          type="button"
                          title={text.tools.commands.send}
                          aria-label={text.tools.commands.send}
                          disabled={!canSendCommands}
                          onClick={() => void sendQuickCommand(command)}
                        >
                          <Zap size={13} aria-hidden="true" />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          title={text.tools.commands.editCommand}
                          aria-label={text.tools.commands.editCommand}
                          onClick={() => editQuickCommand(command)}
                        >
                          <Pencil size={13} aria-hidden="true" />
                        </button>
                        <button
                          className="icon-button icon-button--danger"
                          type="button"
                          title={text.tools.commands.deleteCommand}
                          aria-label={text.tools.commands.deleteCommand}
                          onClick={() => void deleteQuickCommand(command)}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                    <code title={command.command}>{command.command}</code>
                    {command.note ? <small>{command.note}</small> : null}
                  </article>
                ))}
              </section>
            ))
          ) : (
            <div className="queue-empty-state">
              <span>{text.tools.commands.empty}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderThemesPanel() {
    return (
      <div className="tool-content tool-content--themes">
        <section className="terminal-settings" aria-label={text.tools.terminalSettings.font}>
          <label className="terminal-setting-field">
            <span>{text.tools.terminalSettings.fontFamily}</span>
            <select
              value={terminalFont.id}
              aria-label={text.tools.terminalSettings.fontFamily}
              onChange={(event) => {
                const nextFontId = event.currentTarget.value;
                if (isTerminalFontId(nextFontId)) {
                  setTerminalFontId(nextFontId);
                }
              }}
            >
              {terminalFontOptions.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.name}
                </option>
              ))}
            </select>
          </label>

          <div className="terminal-setting-row">
            <span>{text.tools.terminalSettings.textSize}</span>
            <div className="font-size-stepper">
              <button
                type="button"
                title={text.tools.terminalSettings.decreaseTextSize}
                aria-label={text.tools.terminalSettings.decreaseTextSize}
                disabled={terminalFontSize <= MIN_TERMINAL_FONT_SIZE}
                onClick={() => setTerminalFontSize((size) => clampTerminalFontSize(size - 1))}
              >
                <Minus size={16} aria-hidden="true" />
              </button>
              <input
                type="number"
                min={MIN_TERMINAL_FONT_SIZE}
                max={MAX_TERMINAL_FONT_SIZE}
                value={terminalFontSize}
                aria-label={text.tools.terminalSettings.sizeInput}
                onChange={(event) => setTerminalFontSize(parseTerminalFontSize(event.currentTarget.value))}
              />
              <button
                type="button"
                title={text.tools.terminalSettings.increaseTextSize}
                aria-label={text.tools.terminalSettings.increaseTextSize}
                disabled={terminalFontSize >= MAX_TERMINAL_FONT_SIZE}
                onClick={() => setTerminalFontSize((size) => clampTerminalFontSize(size + 1))}
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        <div className="theme-list" role="listbox" aria-label={text.tools.themes.title}>
          {terminalThemes.map((theme) => (
            <button
              key={theme.id}
              className={`theme-option ${terminalTheme.id === theme.id ? "is-active" : ""}`}
              type="button"
              role="option"
              aria-selected={terminalTheme.id === theme.id}
              onClick={() => setTerminalThemeId(theme.id)}
            >
              <span className="theme-preview" style={{ background: theme.preview.background }}>
                <span style={{ background: theme.preview.foreground }} />
                <span style={{ background: theme.preview.muted }} />
                <span style={{ background: theme.preview.foreground }} />
                <span style={{ background: theme.preview.accent }} />
                <span style={{ background: theme.preview.directory }} />
                <span style={{ background: theme.preview.foreground }} />
              </span>
              <span className="theme-option-copy">
                <strong>{theme.name}</strong>
                <small>{terminalTheme.id === theme.id ? text.tools.themes.active : text.tools.themes.apply}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderActiveToolPanel() {
    switch (activeTool) {
      case "themes":
        return renderThemesPanel();
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

  function renderTerminalTabMenu() {
    if (!terminalTabMenu) {
      return null;
    }
    const tab = terminalTabs.find((item) => item.id === terminalTabMenu.tabId);
    if (!tab) {
      return null;
    }
    const canReconnectTab = tab.kind !== "hostPicker" && tab.status !== "connected" && tab.status !== "connecting";
    const canDisconnectTab = Boolean(tab.sessionId) && tab.status !== "disconnected" && tab.status !== "failed";

    return (
      <>
        <div
          className="terminal-tab-menu-backdrop"
          role="presentation"
          onMouseDown={() => setTerminalTabMenu(null)}
          onClick={() => setTerminalTabMenu(null)}
        />
        <div
          className="terminal-tab-menu"
          role="menu"
          aria-label={translate(tab.title, language)}
          style={{ left: terminalTabMenu.x, top: terminalTabMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => duplicateTerminalTab(tab.id)}>
            <RefreshCw size={15} aria-hidden="true" />
            <span>{text.terminal.tabMenu.duplicate}</span>
          </button>
          {canReconnectTab ? (
            <button type="button" role="menuitem" onClick={() => reconnectTerminalTab(tab.id)}>
              <RotateCcw size={15} aria-hidden="true" />
              <span>{text.terminal.tabMenu.reconnect}</span>
            </button>
          ) : (
            <button type="button" role="menuitem" disabled={!canDisconnectTab} onClick={() => void disconnectTerminalTab(tab.id)}>
              <Square size={15} aria-hidden="true" />
              <span>{text.terminal.tabMenu.disconnect}</span>
            </button>
          )}
          <button type="button" role="menuitem" disabled>
            <Maximize2 size={15} aria-hidden="true" />
            <span>{text.terminal.tabMenu.duplicateWindow}</span>
          </button>
          <button type="button" role="menuitem" disabled>
            <Network size={15} aria-hidden="true" />
            <span>{text.terminal.tabMenu.multiplayer}</span>
          </button>
          <span className="terminal-tab-menu-separator" aria-hidden="true" />
          <button type="button" role="menuitem" onClick={() => renameTerminalTab(tab.id)}>
            <Pencil size={15} aria-hidden="true" />
            <span>{text.terminal.tabMenu.rename}</span>
          </button>
          <button type="button" role="menuitem" disabled>
            <Minus size={15} aria-hidden="true" />
            <span>{text.terminal.tabMenu.splitHorizontal}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => closeTerminalTab(tab.id)}>
            <X size={15} aria-hidden="true" />
            <span>{text.terminal.tabMenu.close}</span>
          </button>
        </div>
      </>
    );
  }

  return (
      <main
      className={`app-shell ${activeView === "settings" ? "is-settings-view" : ""} ${
        isHostsHome ? "is-hosts-home" : ""
      }`}
    >
      <aside className="app-rail" aria-label={text.navigation.workspace}>
        <button
          className="rail-brand"
          type="button"
          title={text.terminal.title}
          aria-label={text.terminal.title}
          onClick={() => {
            setActiveView(terminalTabs.length > 0 ? "terminal" : "hosts");
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

      <section className="workspace">
	        {activeView !== "settings" ? (
	          <section className="workspace-view">
	            {terminalTabs.length === 0 ? (
	              renderHostsHome()
	            ) : (
	              <>
	                <section className={`workspace-layer workspace-layer--hosts ${activeView === "hosts" ? "is-active" : ""}`}>
	                  {renderHostsHome()}
	                </section>
	                <section className={`workspace-layer workspace-layer--terminal ${activeView === "terminal" ? "is-active" : ""}`}>
	            <section
	              className={`workbench-grid ${isToolDockCollapsed ? "is-tool-collapsed" : ""} ${
	                isHostPickerActive ? "is-host-picker" : ""
	              } ${isTerminalMaximized ? "is-terminal-maximized" : ""} ${
	                isToolDockResizing ? "is-resizing-tool" : ""
	              }`}
	              style={workbenchStyle}
	            >
              <div className="terminal-column">
	                <section className="terminal-stage" aria-label={text.terminal.title}>
	                  <div className="terminal-tabs">
	                    {visibleTerminalTabs.map((tab) => (
	                      <div
                        key={tab.id}
                        className={`terminal-tab ${activeTerminal.id === tab.id ? "is-active" : ""}`}
                        title={translate(tab.title, language)}
                        onContextMenu={(event) => openTerminalTabMenu(tab.id, event)}
                      >
	                        <button
                            className="terminal-tab-main"
                            type="button"
                            title={translate(tab.title, language)}
                            onClick={() => {
                              setTerminalTabMenu(null);
                              setActiveTerminalTabId(tab.id);
                            }}
                          >
	                          {tab.kind === "hostPicker" ? <Plus size={14} aria-hidden="true" /> : <Terminal size={14} aria-hidden="true" />}
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
	                    >
	                      <Plus size={14} aria-hidden="true" />
                        <span>{text.terminal.newTabTitle}</span>
	                    </button>
	                  </div>
	                  <div className="terminal-content-stack">
	                    <section className={`terminal-host-picker ${isHostPickerActive ? "is-active" : ""}`}>
	                      {renderHostsHome({ embedded: true })}
	                    </section>
	                    <div className={`terminal-content-pane ${!isHostPickerActive ? "is-active" : ""}`}>
	                  <div className="terminal-pane">
	                    <div className="terminal-toolbar">
	                      <span title={activeTerminalHostLabel}>{activeTerminalHostLabel}</span>
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
	                          title={shouldCloseActiveTerminalTab ? text.terminal.closeTab : text.hosts.disconnect}
	                          aria-label={shouldCloseActiveTerminalTab ? text.terminal.closeTab : text.hosts.disconnect}
	                          disabled={isTerminalStopButtonDisabled}
	                          onClick={handleTerminalStopButton}
	                        >
	                          {shouldCloseActiveTerminalTab ? <X size={14} aria-hidden="true" /> : <Square size={14} aria-hidden="true" />}
	                        </button>
                        <button
                          type="button"
                          title={isTerminalMaximized ? text.actions.restore : text.actions.maximize}
                          aria-label={isTerminalMaximized ? text.actions.restore : text.actions.maximize}
                          onClick={() => setIsTerminalMaximized((current) => !current)}
                        >
                          {isTerminalMaximized ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
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
	                    </div>
	                  </div>
	                </section>
              </div>

	              {!isHostPickerActive && !isTerminalMaximized ? (
	              <aside className={`tool-dock ${isToolDockCollapsed ? "is-collapsed" : ""}`} aria-label={text.tools.title}>
                {isToolDockCollapsed ? (
                  renderToolSideRail()
                ) : (
                  <>
                    <button
                      className="tool-dock-resize-handle"
                      type="button"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={text.tools.resizePanel}
                      title={text.tools.resizePanel}
                      aria-valuemin={MIN_TOOL_DOCK_WIDTH}
                      aria-valuemax={MAX_TOOL_DOCK_WIDTH}
                      aria-valuenow={toolDockWidth}
                      onPointerDown={beginToolDockResize}
                      onKeyDown={handleToolDockResizeKeyDown}
                    />
                    {renderToolSideRail()}
                    <div className={`tool-panel ${activeTool === "themes" ? "tool-panel--settings" : ""}`}>
                      {activeTool !== "themes" ? (
                        <div className="tool-panel-heading">
                          <div>
                            <p className="eyebrow">{text.tools.eyebrow}</p>
                            <h2>{translate(activeToolDefinition.label, language)}</h2>
                          </div>
                          <span className={`state-badge state-badge--${hostStatusTone[selectedHost.status]}`}>
                            {text.hosts.statusLabels[selectedHost.status]}
                          </span>
                        </div>
                      ) : null}

                      {renderActiveToolPanel()}
                    </div>
                  </>
                )}
	              </aside>
	              ) : null}
	            </section>
	                </section>
	              </>
	            )}
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
      {renderTerminalTabMenu()}
	      {isHostEditorOpen ? (
	        <div className="modal-backdrop" role="presentation">
          <form className="host-editor" onSubmit={saveHost}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{text.hostEditor.eyebrow}</p>
                <h2>{editingHostId ? text.hostEditor.editTitle : text.hostEditor.title}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title={text.hostEditor.close}
                aria-label={text.hostEditor.close}
                onClick={() => {
                  setIsHostEditorOpen(false);
                  setEditingHostId(null);
                }}
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
              <button
                className="button"
                type="button"
                onClick={() => {
                  setIsHostEditorOpen(false);
                  setEditingHostId(null);
                }}
              >
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

function profileToHostForm(profile: BackendHostProfile): HostFormState {
  return {
    name: profile.name,
    host: profile.host,
    port: String(profile.port),
    username: profile.username,
    groupName: profile.groupName ?? "",
    tags: profile.tags.join(", "),
    note: profile.note ?? "",
    defaultRemotePath: profile.defaultRemotePath ?? "",
    authType: profile.auth.type,
    privateKeyPath: profile.auth.privateKeyPath ?? "",
    saveCredential: profile.auth.saveCredential || Boolean(profile.auth.credentialRef) || profile.auth.type !== "privateKey",
    password: "",
    passphrase: "",
    favorite: profile.favorite
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

function createTerminalTabId(): string {
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createHostPickerTabId(): string {
  return `host_picker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createHostPickerTitle(): LocalizedText {
  return {
    "zh-CN": "新标签页",
    "en-US": "New Tab"
  };
}

function splitTags(value: string): string[] {
  return value
    .split(/[,\s，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isTerminalThemeId(value: string | null): value is TerminalThemeId {
  return terminalThemes.some((theme) => theme.id === value);
}

function isTerminalFontId(value: string | null): value is TerminalFontId {
  return terminalFontOptions.some((font) => font.id === value);
}

function parseTerminalFontSize(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clampTerminalFontSize(parsed) : DEFAULT_TERMINAL_FONT_SIZE;
}

function clampTerminalFontSize(value: number): number {
  return Math.min(MAX_TERMINAL_FONT_SIZE, Math.max(MIN_TERMINAL_FONT_SIZE, Math.round(value)));
}

function parseToolDockWidth(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clampToolDockWidth(parsed) : DEFAULT_TOOL_DOCK_WIDTH;
}

function clampToolDockWidth(value: number): number {
  return Math.min(MAX_TOOL_DOCK_WIDTH, Math.max(MIN_TOOL_DOCK_WIDTH, Math.round(value)));
}

function parseSftpQueueHeight(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clampSftpQueueHeight(parsed) : DEFAULT_SFTP_QUEUE_HEIGHT;
}

function clampSftpQueueHeight(value: number): number {
  return Math.min(MAX_SFTP_QUEUE_HEIGHT, Math.max(MIN_SFTP_QUEUE_HEIGHT, Math.round(value)));
}

function sortSftpEntries(entries: SftpFileEntry[], sort: SftpSortState): SftpFileEntry[] {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...entries].sort((left, right) => {
    const compared = compareSftpEntry(left, right, sort.key);
    if (compared !== 0) {
      return compared * direction;
    }
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

function compareSftpEntry(left: SftpFileEntry, right: SftpFileEntry, key: SftpSortKey): number {
  if (key === "name") {
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  }
  if (key === "modified") {
    return (left.modifiedTime || 0) - (right.modifiedTime || 0);
  }
  if (key === "size") {
    return left.size - right.size;
  }
  const leftKind = left.directory ? "0" : `1-${left.permissions}`;
  const rightKind = right.directory ? "0" : `1-${right.permissions}`;
  return leftKind.localeCompare(rightKind, undefined, { numeric: true, sensitivity: "base" });
}

function joinRemotePath(basePath: string, name: string): string {
  const trimmedName = name.trim();
  if (!basePath || basePath === "/") {
    return `/${trimmedName}`;
  }
  return `${basePath.replace(/\/+$/, "")}/${trimmedName}`;
}

function inferCwdFromShellCommand(command: string, currentCwd: string): string | null {
  const match = command.match(/^cd(?:\s+(.+))?$/);
  if (!match) {
    return null;
  }

  const target = normalizeCdTarget(match[1]);
  if (!target || target === "-") {
    return null;
  }
  if (target === "~") {
    return "~";
  }
  if (target.startsWith("/")) {
    return normalizeRemoteDirectory(target);
  }
  if (target.startsWith("~/")) {
    return normalizeRemoteDirectory(target);
  }
  return normalizeRemoteDirectory(joinRemotePath(currentCwd || "~", target));
}

function normalizeCdTarget(value?: string): string | null {
  if (!value || !value.trim()) {
    return "~";
  }

  const target = value.trim();
  if (/[;&|<>`]/.test(target) || target.includes("$(")) {
    return null;
  }
  if ((target.startsWith('"') && target.endsWith('"')) || (target.startsWith("'") && target.endsWith("'"))) {
    return target.slice(1, -1).trim() || null;
  }
  if (/\s/.test(target)) {
    return null;
  }
  return target;
}

function normalizeRemoteDirectory(path: string): string {
  const isHomeRelative = path === "~" || path.startsWith("~/");
  const prefix = isHomeRelative ? "~" : "";
  const rawSegments = (isHomeRelative ? path.slice(2) : path).split("/");
  const segments: string[] = [];

  for (const segment of rawSegments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  if (isHomeRelative) {
    return segments.length > 0 ? `${prefix}/${segments.join("/")}` : "~";
  }
  return `/${segments.join("/")}`.replace(/\/+$/, "") || "/";
}

function sameRemotePath(left?: string, right?: string): boolean {
  if (!left || !right) {
    return false;
  }
  return trimRemoteSlash(left) === trimRemoteSlash(right);
}

function sameRemoteParent(path: string, parent: string): boolean {
  const normalizedParent = trimRemoteSlash(parent);
  const index = path.lastIndexOf("/");
  const currentParent = index <= 0 ? "/" : path.slice(0, index);
  return trimRemoteSlash(currentParent) === normalizedParent;
}

function trimRemoteSlash(path: string): string {
  return path === "/" ? "/" : path.replace(/\/+$/, "");
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 || size >= 10 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function formatRemoteTime(value?: string): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function parseForwardPort(value: string): number | null {
  const port = Number.parseInt(value.trim(), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return port;
}

function sortForwardRules(rules: BackendForwardRule[]): BackendForwardRule[] {
  return [...rules].sort((left, right) => {
    const statusOrder: Record<ForwardStatus, number> = {
      running: 0,
      starting: 1,
      failed: 2,
      stopping: 3,
      stopped: 4
    };
    const byStatus = statusOrder[left.status] - statusOrder[right.status];
    if (byStatus !== 0) {
      return byStatus;
    }
    return left.name.localeCompare(right.name);
  });
}

function filterAndSortProcesses(entries: BackendProcessEntry[], queryText: string, sort: ProcessSortState): BackendProcessEntry[] {
  const query = queryText.trim().toLocaleLowerCase();
  const filtered = query
    ? entries.filter((entry) =>
        [entry.pid, entry.ppid, entry.user, entry.name, entry.command, entry.state].join(" ").toLocaleLowerCase().includes(query)
      )
    : entries;
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...filtered].sort((left, right) => {
    const compared = compareProcessEntry(left, right, sort.key);
    if (compared !== 0) {
      return compared * direction;
    }
    return right.cpuPercent - left.cpuPercent || left.pid - right.pid;
  });
}

function compareProcessEntry(left: BackendProcessEntry, right: BackendProcessEntry, key: ProcessSortKey): number {
  if (key === "cpu") {
    return left.cpuPercent - right.cpuPercent;
  }
  if (key === "memory") {
    return left.memoryPercent - right.memoryPercent;
  }
  if (key === "pid") {
    return left.pid - right.pid;
  }
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
}

function sortQuickCommands(commands: BackendQuickCommand[]): BackendQuickCommand[] {
  return [...commands].sort((left, right) => {
    const byGroup = (left.groupName || "").localeCompare(right.groupName || "", undefined, { numeric: true, sensitivity: "base" });
    if (byGroup !== 0) {
      return byGroup;
    }
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

function groupQuickCommands(commands: BackendQuickCommand[]): Array<{ groupName: string; commands: BackendQuickCommand[] }> {
  const groups = new Map<string, BackendQuickCommand[]>();
  for (const command of sortQuickCommands(commands)) {
    const groupName = command.groupName?.trim() || "";
    groups.set(groupName, [...(groups.get(groupName) ?? []), command]);
  }
  return Array.from(groups.entries()).map(([groupName, groupedCommands]) => ({
    groupName,
    commands: groupedCommands
  }));
}

function formatPercent(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
}

function formatRate(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "0 B/s";
  }
  return `${formatBytes(value)}/s`;
}

function formatUptime(seconds?: number): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return "-";
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatForwardBind(rule: BackendForwardRule): string {
  const scheme = rule.type === "dynamic" ? "socks" : rule.type;
  return `${scheme}://${rule.bindHost}:${rule.bindPort}`;
}

function formatForwardTarget(rule: BackendForwardRule, text: ReturnType<typeof getMessages>): string {
  if (rule.type === "dynamic") {
    return text.tools.forwards.dynamicTarget;
  }
  return `${rule.targetHost ?? "-"}:${rule.targetPort ?? "-"}`;
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
