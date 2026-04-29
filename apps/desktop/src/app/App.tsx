import type { LucideIcon } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTermTerminal, type IDisposable } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Command,
  Cpu,
  Folder,
  FolderOpen,
  Gauge,
  KeyRound,
  Loader2,
  Lock,
  Maximize2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Palette,
  Play,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Star,
  Terminal,
  Trash2,
  Unlock,
  X,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  saveCredential: true,
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
  const [isToolDockCollapsed, setIsToolDockCollapsed] = useState(true);
  const [hostSearch, setHostSearch] = useState("");
  const [selectedHostId, setSelectedHostId] = useState("");
  const [activeTerminalTabId, setActiveTerminalTabId] = useState("tab-preview");
  const [terminalTabs, setTerminalTabs] = useState<TerminalSession[]>([]);
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

  const text = getMessages(language);
  const terminalTabsRef = useRef<TerminalSession[]>([]);
  const xtermEntriesRef = useRef<Map<string, XTermEntry>>(new Map());
  const pendingTerminalOutputRef = useRef<Map<string, string[]>>(new Map());
  const resizeTimersRef = useRef<Map<string, number>>(new Map());
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
  const activeTerminalHost = hosts.find((host) => host.id === activeTerminal.hostId) ?? selectedHost;
  const activeTerminalHostLabel = activeTerminalHost.id === "__placeholder" ? text.terminal.noHost : formatHostAddress(activeTerminalHost);
  const activeToolDefinition = toolDefinitions.find((tool) => tool.id === activeTool) ?? toolDefinitions[0];

  const favoriteHosts = useMemo(() => hosts.filter((host) => host.favorite), [hosts]);
  const recentHosts = useMemo(() => hosts.filter((host) => host.recent), [hosts]);
  const visibleHosts = useMemo(() => filterHosts(hosts, hostSearch, language), [hosts, hostSearch, language]);
  const visibleFavoriteHosts = useMemo(
    () => filterHosts(favoriteHosts, hostSearch, language),
    [favoriteHosts, hostSearch, language]
  );
  const visibleRecentHosts = useMemo(() => filterHosts(recentHosts, hostSearch, language), [recentHosts, hostSearch, language]);
  const isHostsHome = activeView === "hosts" && terminalTabs.length === 0;
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

    window.termira.removeAllListeners?.("terminal.output");
    window.termira.removeAllListeners?.("terminal.closed");
    window.termira.removeAllListeners?.("ssh.statusChanged");

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
      setTerminalTabs((current) => current.filter((tab) => tab.hostId !== host.id));
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

    const connectedTab = terminalTabsRef.current.find((tab) => tab.hostId === host.id && tab.status === "connected");
    if (!existingTabId && connectedTab) {
      setActiveTerminalTabId(connectedTab.id);
      return;
    }

    const tabId = existingTabId && existingTabId !== "tab-preview" ? existingTabId : `tab_${Date.now()}`;
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

  async function sendCommandToActiveTerminal(command: string) {
    if (!activeTerminal.sessionId || !activeTerminal.channelId || activeTerminal.status !== "connected") {
      setTerminalError(text.tools.commands.unavailable);
      return;
    }
    setTerminalError(null);
    try {
      await window.termira.invoke("terminal.write", {
        sessionId: activeTerminal.sessionId,
        channelId: activeTerminal.channelId,
        data: `${command}\n`
      });
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
        <div
          key={host.id}
          className={`host-row ${selectedHostId === host.id ? "is-active" : ""}`}
        >
          <button
            className="host-row-main"
            type="button"
            title={text.hosts.doubleClickConnect}
            onClick={() => selectHost(host.id)}
            onDoubleClick={() => openTerminalForHost(host)}
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
          <span className="host-row-actions">
            <button
              className="host-row-action"
              type="button"
              title={text.hosts.editHost}
              aria-label={text.hosts.editHost}
              onClick={() => openEditHostEditor(host.id)}
            >
              <Pencil size={13} aria-hidden="true" />
            </button>
            <button
              className="host-row-action host-row-action--danger"
              type="button"
              title={text.hosts.deleteHost}
              aria-label={text.hosts.deleteHost}
              onClick={() => void deleteHost(host)}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </span>
        </div>
      );
    });
  }

  function renderHostCards(items: HostItem[]) {
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
          onClick={() => selectHost(host.id)}
          onDoubleClick={() => openTerminalForHost(host)}
        >
          <button
            className="host-card-main"
            type="button"
            title={text.hosts.doubleClickConnect}
            onClick={() => selectHost(host.id)}
            onDoubleClick={() => openTerminalForHost(host)}
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

  function renderHostsHome() {
    const canConnectSelected = selectedHost.id !== "__placeholder" && selectedHost.status !== "connecting";

    return (
      <section className="hosts-home" aria-label={text.hosts.sidebarTitle}>
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
          <button className="button button--compact" type="button" disabled={!canConnectSelected} onClick={() => openTerminalForHost(selectedHost)}>
            <Play size={14} aria-hidden="true" />
            <span>{text.hosts.connectSelected}</span>
          </button>
        </div>

        <div className="hosts-home-actions">
          <button className="button button--compact button--accent" type="button" onClick={openCreateHostEditor}>
            <Plus size={15} aria-hidden="true" />
            <span>{text.hosts.newHost}</span>
          </button>
          <button className="button button--compact" type="button" disabled={!canConnectSelected} onClick={() => openTerminalForHost(selectedHost)}>
            <Terminal size={15} aria-hidden="true" />
            <span>{text.terminal.tabLabel}</span>
          </button>
        </div>

        <section className="hosts-home-board">
          <div className="hosts-home-heading">
            <h2>{text.hosts.homeTitle}</h2>
            <span>{text.hosts.hostCount(visibleHosts.length)}</span>
          </div>
          <div className="host-card-grid">{renderHostCards(visibleHosts)}</div>
        </section>
      </section>
    );
  }

  function renderFilesPanel() {
    return (
      <div className="tool-content">
        {renderFutureToolPanel(<FolderOpen size={18} aria-hidden="true" />, text.tools.files.unavailable)}
      </div>
    );
  }

  function renderForwardsPanel() {
    return (
      <div className="tool-content">
        {renderFutureToolPanel(<Network size={18} aria-hidden="true" />, text.tools.forwards.unavailable)}
      </div>
    );
  }

  function renderMonitorPanel() {
    return (
      <div className="tool-content">
        {renderFutureToolPanel(<Gauge size={18} aria-hidden="true" />, text.tools.monitor.unavailable)}
      </div>
    );
  }

  function renderProcessesPanel() {
    return (
      <div className="tool-content">
        {renderFutureToolPanel(<Cpu size={18} aria-hidden="true" />, text.tools.processes.unavailable)}
      </div>
    );
  }

  function renderCommandsPanel() {
    return (
      <div className="tool-content">
        <div className="split-actions">
          <button className="button button--compact button--accent" type="button" disabled>
            <Plus size={15} aria-hidden="true" />
            <span>{text.tools.commands.newCommand}</span>
          </button>
          <button className="button button--compact" type="button" disabled>
            <Folder size={15} aria-hidden="true" />
            <span>{text.tools.commands.groups}</span>
          </button>
        </div>
        <div className="inline-state">
          <Zap size={15} aria-hidden="true" />
          <span>{text.tools.commands.unavailable}</span>
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
                  disabled={command.disabled || activeTerminal.status !== "connected"}
                  title={text.tools.commands.send}
                  onClick={() => sendCommandToActiveTerminal(command.command)}
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

  function renderFutureToolPanel(icon: ReactNode, message: string) {
    return (
      <div className="tool-future">
        <span>{icon}</span>
        <strong>{message}</strong>
      </div>
    );
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
        isHostsHome ? "is-hosts-home" : ""
      } ${
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

      {activeView === "hosts" && !isSidebarCollapsed && !isHostsHome ? (
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
              onClick={openCreateHostEditor}
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
            {terminalTabs.length === 0 ? (
              renderHostsHome()
            ) : (
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
