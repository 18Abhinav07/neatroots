import { useState } from "react";
import { post, useFetch, type CheckRow } from "../api";
import { pct } from "../format";
import { BoltIcon, Pill, go, toast } from "./bits";

interface ChecksResponse {
  checks: CheckRow[];
  errors: { path: string; id?: string; message: string }[];
  user_dir: string;
  project_dirs: string[];
}

interface PreviewResult {
  checked: number;
  total: number;
  hits: { trace_id: string; probability: number | null; root_name: string | null }[];
  hit_rate: number | null;
  truncated: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  library: "Bolts library",
  user: "Yours (~/.bolts/checks)",
  project: "Project (.bolts/checks)",
  planner: "Written by the planner",
  mcp: "Added by a coding agent",
};

export function ChecksPage() {
  const { data, reload } = useFetch<ChecksResponse>("/api/checks");
  const [concern, setConcern] = useState("");
  const [yaml, setYaml] = useState("");
  const [busy, setBusy] = useState<string>();
  const [preview, setPreview] = useState<PreviewResult>();
  const [open, setOpen] = useState<string>();

  const checks = data?.checks ?? [];
  const groups: [string, CheckRow[]][] = [
    ["Rules · code, every span, no model", checks.filter((c) => c.kind === "rule")],
    ...(["user", "project", "mcp", "planner", "library"] as const).map(
      (src) => [`Questions · ${SOURCE_LABEL[src]}`, checks.filter((c) => c.kind !== "rule" && c.source === src)] as [string, CheckRow[]],
    ),
  ];

  const draft = async () => {
    setBusy("draft");
    setPreview(undefined);
    try {
      const r = await post<{ yaml: string }>("/api/checks/draft", { concern });
      setYaml(r.yaml);
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(undefined);
  };

  const runPreview = async () => {
    setBusy("preview");
    try {
      setPreview(await post<PreviewResult>("/api/checks/preview", { yaml, limit: 50 }));
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(undefined);
  };

  const save = async () => {
    setBusy("save");
    try {
      const r = await post<{ id: string; path: string }>("/api/checks", { yaml });
      toast(`Saved ${r.id} to ${r.path}`);
      setYaml("");
      setConcern("");
      setPreview(undefined);
      reload();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(undefined);
  };

  return (
    <div className="page">
      <h2 className="page-title">Checks</h2>
      <p className="page-sub">
        Everything Bolts watches for. Rules run in code on every span; questions go to the decision model; the planner picks which library questions fit each agent.
      </p>
      {data?.errors.length ? (
        <div className="card section" style={{ borderColor: "var(--err)" }}>
          <div className="card-body">
            {data.errors.map((e, i) => (
              <div key={i} className="hint" style={{ color: "var(--err)" }}>
                {e.path}
                {e.id ? ` (${e.id})` : ""}: {e.message}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="checks-grid">
        <div className="card">
          {groups
            .filter(([, list]) => list.length)
            .map(([label, list]) => (
              <div key={label}>
                <div className="group-label">{label}</div>
                {list.map((c) => (
                  <div key={c.id}>
                    <div className="check-row">
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={c.enabled}
                          onChange={async (e) => {
                            await post(`/api/checks/${c.id}/enabled`, { enabled: e.target.checked });
                            reload();
                          }}
                        />
                      </label>
                      <div style={{ minWidth: 0, cursor: "pointer" }} onClick={() => setOpen(open === c.id ? undefined : c.id)}>
                        <div className="title">{c.title}</div>
                        <div className="id mono">
                          {c.id} · {c.kind}
                          {typeof c.check.scope === "string" ? ` · ${c.check.scope}` : ""}
                        </div>
                      </div>
                      <div className="label-row" style={{ justifyContent: "flex-end" }}>
                        {c.precision.hits > 0 && (
                          <span className="hint" title={`${c.precision.hits} findings, ${c.precision.dismissed} dismissed`}>
                            {c.precision.hits} hits · precision {pct(c.precision.precision)}
                          </span>
                        )}
                        {c.precision.noisy && <Pill kind="interrupted">noisy · consider retiring</Pill>}
                      </div>
                    </div>
                    {open === c.id && (
                      <div style={{ padding: "0 14px 14px" }}>
                        <pre className="json">{c.yaml}</pre>
                        <div className="label-row" style={{ marginTop: 8 }}>
                          <button
                            className="btn small"
                            onClick={() => {
                              setYaml(c.yaml);
                              setPreview(undefined);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Edit a copy
                          </button>
                          {c.path && <span className="hint mono">{c.path}</span>}
                          {c.source !== "library" && (
                            <button
                              className="btn small ghost danger"
                              onClick={async () => {
                                if (!window.confirm(`Delete ${c.id}?`)) return;
                                await fetch(`/api/checks/${c.id}`, { method: "DELETE" });
                                reload();
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
        </div>

        <div className="card" style={{ position: "sticky", top: 16 }}>
          <div className="card-head">
            <h3>
              <BoltIcon size={12} /> New check
            </h3>
          </div>
          <div className="card-body">
            <div className="form-row">
              <label>Describe a problem in plain language; the local LLM writes the question.</label>
              <textarea
                className="input"
                rows={3}
                style={{ fontFamily: "var(--font-ui)", fontSize: 13 }}
                placeholder="e.g. The agent refunds without checking the customer owns the order"
                value={concern}
                onChange={(e) => setConcern(e.target.value)}
              />
            </div>
            <button className="btn" disabled={concern.length < 8 || !!busy} onClick={draft}>
              {busy === "draft" ? <span className="spinner" /> : null} Draft question
            </button>
            <div className="form-row" style={{ marginTop: 16 }}>
              <label>Check (YAML). Edit freely, or paste your own.</label>
              <textarea className="input" rows={14} value={yaml} onChange={(e) => setYaml(e.target.value)} placeholder={"id: my-check\nkind: yes_no\nscope: trace\nask: Did the agent ...?\nflag_at: 0.8"} />
            </div>
            <div className="label-row">
              <button className="btn" disabled={!yaml || !!busy} onClick={runPreview}>
                {busy === "preview" ? <span className="spinner" /> : null} Preview on last 50 runs
              </button>
              <button className="btn primary" disabled={!yaml || !!busy} onClick={save}>
                Save
              </button>
            </div>
            {preview && (
              <div style={{ marginTop: 14 }}>
                <div>
                  Fired on <b>{preview.hits.length}</b> of {preview.checked} runs{preview.truncated ? ` (stopped early; ${preview.total} available)` : ""} · hit rate{" "}
                  <b style={{ color: "var(--signal)" }}>{pct(preview.hit_rate)}</b>
                </div>
                {preview.hits.slice(0, 8).map((h) => (
                  <div key={h.trace_id} className="hint" style={{ cursor: "pointer", marginTop: 4 }} onClick={() => go(`runs/${h.trace_id}`)}>
                    <span className="mono">{h.trace_id.slice(0, 8)}</span> {h.root_name} {h.probability !== null ? `· ${pct(h.probability)}` : ""}
                  </div>
                ))}
              </div>
            )}
            <p className="hint" style={{ marginTop: 16 }}>
              Saved to {data?.user_dir ?? "~/.bolts/checks"}. Put checks in your repo's <span className="mono">.bolts/checks/</span> after <span className="mono">bolts init</span> to share them.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
