import {
  Activity,
  Clock,
  Folder,
  KeyRound,
  Plus,
  Power,
  RefreshCcw,
  Search,
  Server,
  Settings,
  Star,
  Terminal,
  Wifi,
  WifiOff
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

type LocalizedText = Record<AppLanguage, string>;

type HostItem = {
  id: string;
  name: LocalizedText;
  group: LocalizedText;
  address: string;
  identity: string;
  port: number;
  lastConnected: LocalizedText;
  tags: LocalizedText[];
  favorite: boolean;
};

const initialStatus: BackendStatus = {
  state: "starting",
  logDir: ""
};

const LANGUAGE_STORAGE_KEY = "termira.ui.language";

const hosts: HostItem[] = [
  {
    id: "prod-api-01",
    name: { "zh-CN": "生产 API 01", "en-US": "Production API 01" },
    group: { "zh-CN": "生产环境", "en-US": "Production" },
    address: "ubuntu@10.0.8.12",
    identity: "termira-prod.pem",
    port: 22,
    lastConnected: { "zh-CN": "今天 10:18", "en-US": "Today 10:18" },
    tags: [
      { "zh-CN": "常用", "en-US": "Pinned" },
      { "zh-CN": "跳板机", "en-US": "Bastion" }
    ],
    favorite: true
  },
  {
    id: "staging-web",
    name: { "zh-CN": "预发 Web", "en-US": "Staging Web" },
    group: { "zh-CN": "预发环境", "en-US": "Staging" },
    address: "deploy@172.16.4.20",
    identity: "termira-staging",
    port: 22,
    lastConnected: { "zh-CN": "昨天 18:42", "en-US": "Yesterday 18:42" },
    tags: [{ "zh-CN": "Web", "en-US": "Web" }],
    favorite: true
  },
  {
    id: "dev-box",
    name: { "zh-CN": "开发机", "en-US": "Dev Box" },
    group: { "zh-CN": "个人服务器", "en-US": "Personal" },
    address: "df@192.168.31.56",
    identity: "id_ed25519",
    port: 22,
    lastConnected: { "zh-CN": "周一 09:06", "en-US": "Mon 09:06" },
    tags: [{ "zh-CN": "本地", "en-US": "Local" }],
    favorite: false
  }
];

export function App() {
  const [language, setLanguage] = useState<AppLanguage>(() => {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isAppLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  });
  const [status, setStatus] = useState<BackendStatus>(initialStatus);
  const [activeView, setActiveView] = useState<ActiveView>("hosts");
  const [hostSearch, setHostSearch] = useState("");
  const [selectedHostId, setSelectedHostId] = useState(hosts[0].id);
  const [lastPing, setLastPing] = useState<PingResult | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

  const text = getMessages(language);
  const statusTone = getBackendStateTone(status.state);
  const isOnline = status.state === "online";

  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? hosts[0];
  const favoriteHosts = hosts.filter((host) => host.favorite);
  const visibleHosts = useMemo(() => {
    const query = hostSearch.trim().toLocaleLowerCase();

    if (!query) {
      return hosts;
    }

    return hosts.filter((host) => {
      const searchable = [
        host.name[language],
        host.group[language],
        host.address,
        host.identity,
        ...host.tags.map((tag) => tag[language])
      ]
        .join(" ")
        .toLocaleLowerCase();

      return searchable.includes(query);
    });
  }, [hostSearch, language]);

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

    window.termira.on("backend.ready", handleLifecycleEvent);
    window.termira.on("backend.exited", handleLifecycleEvent);
    window.termira.on("backend.error", handleLifecycleEvent);
    window.termira.on("backend.starting", handleLifecycleEvent);

    return () => {
      window.termira.off("backend.ready", handleLifecycleEvent);
      window.termira.off("backend.exited", handleLifecycleEvent);
      window.termira.off("backend.error", handleLifecycleEvent);
      window.termira.off("backend.starting", handleLifecycleEvent);
    };
  }, [text]);

  async function refreshStatus() {
    const nextStatus = (await window.termira.invoke("app.getBackendStatus")) as BackendStatus;
    setStatus(nextStatus);
  }

  async function pingBackend() {
    setBusyAction("ping");
    try {
      const result = (await window.termira.invoke("app.ping")) as PingResult;
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
      await window.termira.invoke("app.shutdown");
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
      await window.termira.invoke("app.restartBackend");
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
          onClick={() => setActiveView("hosts")}
        >
          <Server size={18} aria-hidden="true" />
        </button>
        <button
          className={`rail-button ${activeView === "settings" ? "is-active" : ""}`}
          type="button"
          title={text.navigation.settings}
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
                {favoriteHosts.map((host) => (
                  <button
                    key={host.id}
                    className={`host-row ${selectedHost.id === host.id ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setSelectedHostId(host.id)}
                  >
                    <span className="host-row-icon">
                      <Server size={15} aria-hidden="true" />
                    </span>
                    <span className="host-row-copy">
                      <strong>{host.name[language]}</strong>
                      <small>{host.address}</small>
                    </span>
                  </button>
                ))}
              </section>

              <section className="host-section">
                <div className="section-title">
                  <Folder size={14} aria-hidden="true" />
                  <span>{text.hosts.allHosts}</span>
                </div>
                {visibleHosts.length > 0 ? (
                  visibleHosts.map((host) => (
                    <button
                      key={host.id}
                      className={`host-row ${selectedHost.id === host.id ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setSelectedHostId(host.id)}
                    >
                      <span className="host-row-icon">
                        <Server size={15} aria-hidden="true" />
                      </span>
                      <span className="host-row-copy">
                        <strong>{host.name[language]}</strong>
                        <small>{host.group[language]}</small>
                      </span>
                      <span className="host-row-meta">{host.lastConnected[language]}</span>
                    </button>
                  ))
                ) : (
                  <p className="empty-copy">{text.hosts.empty}</p>
                )}
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
              <div>
                <p className="eyebrow">{text.hosts.workspaceEyebrow}</p>
                <h1>{text.hosts.workspaceTitle}</h1>
              </div>
              <button className="button button--accent" type="button">
                <Terminal size={16} aria-hidden="true" />
                <span>{text.hosts.connect}</span>
              </button>
            </header>

            <section className="terminal-stage" aria-label={text.terminal.title}>
              <div className="terminal-tabs">
                <button className="is-active" type="button">
                  {selectedHost.name[language]}
                </button>
                <button type="button">
                  <Plus size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="terminal-pane">
                <div className="terminal-toolbar">
                  <span>{selectedHost.address}</span>
                  <span>{text.terminal.mockBadge}</span>
                </div>
                <pre>
                  {[
                    `$ ssh -p ${selectedHost.port} ${selectedHost.address}`,
                    text.terminal.connected(selectedHost.name[language]),
                    text.terminal.ready,
                    text.terminal.placeholder
                  ].join("\n")}
                </pre>
              </div>
            </section>

            <section className="inspector-grid">
              <div className="workspace-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{text.hosts.detailsEyebrow}</p>
                    <h2>{selectedHost.name[language]}</h2>
                  </div>
                </div>
                <dl className="detail-list">
                  <div>
                    <dt>{text.hosts.address}</dt>
                    <dd>{selectedHost.address}</dd>
                  </div>
                  <div>
                    <dt>{text.hosts.group}</dt>
                    <dd>{selectedHost.group[language]}</dd>
                  </div>
                  <div>
                    <dt>{text.hosts.port}</dt>
                    <dd>{selectedHost.port}</dd>
                  </div>
                  <div>
                    <dt>{text.hosts.identity}</dt>
                    <dd>{selectedHost.identity}</dd>
                  </div>
                </dl>
              </div>

              <div className="workspace-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{text.hosts.sessionEyebrow}</p>
                    <h2>{text.hosts.sessionTitle}</h2>
                  </div>
                </div>
                <div className="tag-row">
                  {selectedHost.tags.map((tag) => (
                    <span key={tag[language]}>{tag[language]}</span>
                  ))}
                </div>
                <div className="session-row">
                  <Clock size={16} aria-hidden="true" />
                  <span>{text.hosts.lastConnected}</span>
                  <strong>{selectedHost.lastConnected[language]}</strong>
                </div>
                <div className="session-row">
                  <KeyRound size={16} aria-hidden="true" />
                  <span>{text.hosts.auth}</span>
                  <strong>{text.hosts.keyAuth}</strong>
                </div>
              </div>
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
