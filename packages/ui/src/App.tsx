import { useCallback, useEffect, useRef, useState } from "react";
import { api, post, useEvents, useFetch, type Push, type Run, type Status } from "./api";
import { BoltIcon, Toaster, go, toast, useRoute } from "./components/bits";
import { RunsRail } from "./components/RunsRail";
import { RunView } from "./components/RunView";
import { EmptyState } from "./components/EmptyState";
import { ChecksPage } from "./components/ChecksPage";
import { SettingsPage } from "./components/SettingsPage";

export function App() {
  const route = useRoute();
  const page = route[0] ?? "runs";
  const runId = page === "runs" ? route[1] : undefined;

  const status = useFetch<Status>("/api/status");
  const [runs, setRuns] = useState<Run[]>([]);
  const [filters, setFilters] = useState({ q: "", status: "", findings: false, project: "" });
  const [pulse, setPulse] = useState(false);
  const [tick, setTick] = useState(0);
  const pushes = useFetch<{ pushes: Push[] }>("/api/pushes");
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadRuns = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.status) p.set("status", filters.status);
    if (filters.findings) p.set("has_finding", "1");
    if (filters.project) p.set("project", filters.project);
    p.set("limit", "150");
    api<{ runs: Run[] }>(`/api/runs?${p}`)
      .then((r) => setRuns(r.runs))
      .catch(() => undefined);
  }, [filters]);

  useEffect(loadRuns, [loadRuns]);

  // Relative times stay fresh.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const connected = useEvents((event, data) => {
    if (event === "trace") {
      setPulse(true);
      setTimeout(() => setPulse(false), 900);
    }
    if (event === "activity" && String(data.kind ?? "").startsWith("push")) pushes.reload();
    if (event === "settings") status.reload();
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      loadRuns();
      setTick((x) => x + 1);
    }, 350);
  });

  // The app tells Bolts which run is in focus, for the coding agent's get_current_run.
  useEffect(() => {
    if (runId) void post("/api/focus", { trace_id: runId }).catch(() => undefined);
  }, [runId]);

  const s = status.data;
  const pending = (pushes.data?.pushes ?? []).filter((p) => p.status === "pending");

  return (
    <div className="shell">
      <header className="topbar">
        <a className="wordmark" href="#/runs">
          <BoltIcon size={20} />
          bolts
          <small>{s ? `v${s.version}` : ""}</small>
        </a>
        <nav className="nav">
          <a href="#/runs" className={page === "runs" ? "active" : ""}>
            Runs
          </a>
          <a href="#/checks" className={page === "checks" ? "active" : ""}>
            Checks
          </a>
          <a href="#/settings" className={page === "settings" ? "active" : ""}>
            Settings
          </a>
        </nav>
        <div className="spacer" />
        <span className={`chip live ${pulse ? "pulse" : ""}`} title={connected ? "Receiving live updates" : "Reconnecting to Bolts…"}>
          <span className={`dot ${connected ? "ok" : "err"}`} />
          {connected ? "live" : "offline"}
        </span>
        {s?.engine && (
          <>
            <span className="chip" title={s.engine.llm.error ?? `Local LLM at ${s.config.llm.baseUrl}`}>
              <span className={`dot ${s.engine.llm.ok ? "ok" : "warn"}`} />
              LLM <span className="mono">{s.engine.llm.ok ? s.engine.llm.model : "none"}</span>
              {s.engine.llm.busy > 0 && <span className="spinner" />}
            </span>
            <span className="chip" title="The model that answers typed questions on every span">
              <span className={`dot ${s.engine.decision.backend === "jev" ? "ok" : s.engine.decision.backend ? "warn" : "err"}`} />
              decisions <span className="mono">{s.engine.decision.backend === "jev" ? s.engine.decision.model : s.engine.decision.backend === "llm" ? "llm stand-in" : "none"}</span>
            </span>
          </>
        )}
        {s && (
          <label className="switch" title="Global steering switch. Off means nothing is ever sent to a running agent.">
            <input
              type="checkbox"
              checked={s.steering.enabled}
              onChange={async (e) => {
                await post("/api/settings", { steering_enabled: e.target.checked });
                toast(e.target.checked ? "Steering is on for projects that enabled it" : "Steering is off everywhere");
                status.reload();
              }}
            />
            steering
          </label>
        )}
      </header>

      <div style={{ display: "grid", gridTemplateRows: pending.length ? "auto 1fr" : "1fr", minHeight: 0 }}>
        {pending.length > 0 && <PushBanner pushes={pending} onDone={pushes.reload} />}
        {page === "checks" ? (
          <main className="main">
            <ChecksPage />
          </main>
        ) : page === "settings" ? (
          <main className="main">
            <SettingsPage status={s} onChange={status.reload} />
          </main>
        ) : (
          <div className="runs-layout" style={{ minHeight: 0 }}>
            <RunsRail runs={runs} selected={runId} filters={filters} setFilters={setFilters} tick={tick} />
            <main className="main">
              {runId ? (
                <RunView key={runId} traceId={runId} tick={tick} />
              ) : runs.length ? (
                <SelectHint runs={runs} />
              ) : (
                <EmptyState port={s?.port ?? 4100} status={s} />
              )}
            </main>
          </div>
        )}
      </div>
      <Toaster />
    </div>
  );
}

function SelectHint({ runs }: { runs: Run[] }) {
  useEffect(() => {
    if (runs[0] && window.innerWidth > 760) go(`runs/${runs[0].trace_id}`);
  }, [runs]);
  return null;
}

function PushBanner({ pushes, onDone }: { pushes: Push[]; onDone: () => void }) {
  const p = pushes[0];
  const [preview, setPreview] = useState<{ span_count: number; redactions: { kind: string; count: number }[]; has_key: boolean; endpoint: string }>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void post<typeof preview>("/api/cloud/preview", { trace_ids: p.trace_ids }).then(setPreview);
  }, [p.id]);
  return (
    <div className="banner">
      <BoltIcon />
      <span className="grow">
        Your coding agent asked to send <b>{p.trace_ids.length} run{p.trace_ids.length > 1 ? "s" : ""}</b> to Neatlogs Cloud
        {preview && (
          <span className="muted">
            {" "}
            · {preview.span_count} spans · {preview.redactions.length ? preview.redactions.map((r) => `${r.count} ${r.kind} redacted`).join(", ") : "nothing to redact"} → {preview.endpoint}
          </span>
        )}
        {preview && !preview.has_key && <span style={{ color: "var(--err)" }}> · add an API key in Settings first</span>}
      </span>
      <button
        className="btn small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await post(`/api/pushes/${p.id}/decline`);
          setBusy(false);
          onDone();
        }}
      >
        Decline
      </button>
      <button
        className="btn small primary"
        disabled={busy || (preview && !preview.has_key)}
        onClick={async () => {
          setBusy(true);
          const r = await post<Push>(`/api/pushes/${p.id}/confirm`).catch((e) => ({ status: "failed", error: (e as Error).message }) as Push);
          setBusy(false);
          toast(r.status === "sent" ? "Sent to Neatlogs Cloud" : `Could not send: ${r.error ?? "unknown error"}`);
          onDone();
        }}
      >
        {busy ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
