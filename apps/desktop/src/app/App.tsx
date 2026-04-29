import { Activity, Power, RefreshCcw, Server, Terminal, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BackendStatus, PingResult } from "@termira/shared";
import { formatBackendState, getBackendStateTone } from "../utils/backendStatus";

type TimelineEntry = {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
};

const initialStatus: BackendStatus = {
  state: "starting",
  logDir: ""
};

export function App() {
  const [status, setStatus] = useState<BackendStatus>(initialStatus);
  const [lastPing, setLastPing] = useState<PingResult | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

  const statusTone = getBackendStateTone(status.state);
  const isOnline = status.state === "online";

  const versionText = useMemo(() => {
    if (!status.protocolVersion && !status.backendVersion) {
      return "Protocol pending";
    }

    return `Protocol ${status.protocolVersion ?? "-"} / Backend ${status.backendVersion ?? "-"}`;
  }, [status.backendVersion, status.protocolVersion]);

  useEffect(() => {
    void refreshStatus();

    const handleLifecycleEvent = (payload: unknown, event: string) => {
      appendTimeline(event, summarizePayload(payload));
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
  }, []);

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
      appendTimeline("app.shutdown", "accepted");
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
      appendTimeline("app.restartBackend", "starting");
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
      <aside className="rail" aria-label="Termira workspace navigation">
        <div className="brand-mark">
          <Terminal size={22} aria-hidden="true" />
        </div>
        <button className="rail-button is-active" type="button" title="Backend">
          <Server size={18} aria-hidden="true" />
        </button>
        <button className="rail-button" type="button" title="Activity">
          <Activity size={18} aria-hidden="true" />
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Termira</p>
            <h1>Engineering Baseline</h1>
          </div>
          <div className={`status-pill status-pill--${statusTone}`}>
            {isOnline ? <Wifi size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
            <span>{formatBackendState(status.state)}</span>
          </div>
        </header>

        <section className="baseline-grid">
          <div className="panel panel--primary">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Java sidecar</p>
                <h2>{isOnline ? "Backend online" : "Backend offline"}</h2>
              </div>
              <span className={`health-dot health-dot--${statusTone}`} aria-hidden="true" />
            </div>

            <dl className="metric-grid">
              <div>
                <dt>Process</dt>
                <dd>{status.pid ? `PID ${status.pid}` : "Not running"}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{versionText}</dd>
              </div>
              <div>
                <dt>Last ping</dt>
                <dd>{lastPing?.timestamp ?? "No ping yet"}</dd>
              </div>
              <div>
                <dt>Logs</dt>
                <dd className="path-text">{status.logDir || "Pending"}</dd>
              </div>
            </dl>

            {status.lastError ? <p className="inline-error">{status.lastError}</p> : null}

            <div className="action-row">
              <button className="button button--accent" type="button" onClick={pingBackend} disabled={!isOnline || busyAction !== null}>
                <Activity size={16} aria-hidden="true" />
                <span>{busyAction === "ping" ? "Pinging" : "Ping"}</span>
              </button>
              <button className="button" type="button" onClick={restartBackend} disabled={busyAction !== null}>
                <RefreshCcw size={16} aria-hidden="true" />
                <span>{busyAction === "restart" ? "Restarting" : "Restart"}</span>
              </button>
              <button className="button button--danger" type="button" onClick={stopBackend} disabled={!isOnline || busyAction !== null}>
                <Power size={16} aria-hidden="true" />
                <span>{busyAction === "stop" ? "Stopping" : "Stop"}</span>
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">IPC timeline</p>
                <h2>Runtime events</h2>
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
                  <span>Waiting</span>
                  <strong>No events yet</strong>
                  <time>-</time>
                </li>
              )}
            </ol>
          </div>
        </section>
      </section>
    </main>
  );
}

function summarizePayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return payload === undefined ? "received" : String(payload);
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.message === "string") {
    return record.message;
  }

  if ("code" in record || "signal" in record) {
    return `code=${String(record.code ?? "-")} signal=${String(record.signal ?? "-")}`;
  }

  if (typeof record.backendVersion === "string") {
    return `backend ${record.backendVersion}`;
  }

  return "received";
}
