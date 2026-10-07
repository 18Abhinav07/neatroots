import { useEffect, useState } from "react";
import { api, post, useFetch, type ProjectRow, type Status } from "../api";
import { ago, bytes } from "../format";
import { CopyButton, toast } from "./bits";

const MODES = ["off", "advisory", "gate", "self-check"];

const MODE_HELP: Record<string, string> = {
  off: "Nothing is sent.",
  advisory: "Notes are added to the agent's next LLM call.",
  gate: "Each LLM call waits up to 300 ms for pending checks on the run.",
  "self-check": "The agent gets a check_my_work tool to ask Bolts.",
};

export function SettingsPage({ status, onChange }: { status?: Status; onChange: () => void }) {
  const projects = useFetch<{ projects: ProjectRow[] }>("/api/projects");
  const forwards = useFetch<{ forwards: { id: string; trace_ids: string[]; status: string; error: string | null; created_ms: number; span_count: number; redactions: number }[] }>("/api/forwards");
  const [llmUrl, setLlmUrl] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [clsBackend, setClsBackend] = useState("auto");
  const [clsUrl, setClsUrl] = useState("");
  const [key, setKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [patterns, setPatterns] = useState("");

  useEffect(() => {
    if (!status) return;
    setLlmUrl(status.config.llm.baseUrl);
    setLlmModel(status.config.llm.model);
    setClsBackend(status.config.classifier.backend);
    setClsUrl(status.config.classifier.baseUrl);
    setEndpoint(status.cloud.endpoint);
  }, [status]);

  const save = async (body: Record<string, unknown>, msg = "Saved") => {
    try {
      await post("/api/settings", body);
      toast(msg);
      onChange();
      projects.reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const port = status?.port ?? 4100;
  const mcpClaude = `claude mcp add --scope user bolts -- npx -y @neatlogs/bolts mcp`;
  const mcpHttp = `http://localhost:${port}/mcp`;

  return (
    <div className="page">
      <h2 className="page-title">Settings</h2>
      <p className="page-sub">Everything stays on this machine unless you send it. Steering and cloud forwarding are opt-in per project.</p>

      <div className="card section">
        <div className="card-head">
          <h3>Projects</h3>
          <span className="hint">a project is the SDK's service name / workflow_name</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Runs</th>
              <th>Steering</th>
              <th>Forward to cloud</th>
            </tr>
          </thead>
          <tbody>
            {(projects.data?.projects ?? []).map((p) => (
              <tr key={p.project}>
                <td>
                  <b>{p.project}</b>
                  <div className="hint">last run {ago(p.last_ms)}</div>
                </td>
                <td>
                  {p.runs} <span className="hint">({p.with_findings} flagged)</span>
                </td>
                <td>
                  <select className="input" style={{ width: 150 }} value={p.settings.steering} onChange={(e) => save({ project: p.project, steering: e.target.value }, `Steering for ${p.project}: ${e.target.value}`)}>
                    {MODES.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                  <div className="hint">{MODE_HELP[p.settings.steering]}</div>
                </td>
                <td>
                  <label className="switch">
                    <input type="checkbox" checked={p.settings.forward} onChange={(e) => save({ project: p.project, forward: e.target.checked })} />
                    {p.settings.forward ? "each finished run" : "off"}
                  </label>
                </td>
              </tr>
            ))}
            {!projects.data?.projects.length && (
              <tr>
                <td colSpan={4} className="muted">
                  Projects appear here after their first run.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="card-body hint">
          Steering needs the hook in your agent: <span className="mono">pip install bolts-steer</span>, then <span className="mono">client = bolts_steer.wrap(OpenAI())</span>.
          {status && <> Hooks connected now: {status.steering.hooks_connected}.</>}
        </div>
      </div>

      <div className="settings-grid">
        <div className="card">
          <div className="card-head">
            <h3>Local models</h3>
            <span className="hint">
              {status?.tier.memoryGb} GB · {status?.tier.tier} tier
            </span>
          </div>
          <div className="card-body">
            <p className="hint" style={{ marginTop: 0 }}>
              {status?.tier.description}
            </p>
            <div className="form-row">
              <label>LLM server (OpenAI-compatible: Ollama, LM Studio, llama.cpp, MLX)</label>
              <input className="input mono" value={llmUrl} onChange={(e) => setLlmUrl(e.target.value)} />
            </div>
            <div className="form-row">
              <label>LLM model ("auto" picks an installed one)</label>
              <input className="input mono" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} />
            </div>
            <div className="form-row">
              <label>Decision model</label>
              <select className="input" value={clsBackend} onChange={(e) => setClsBackend(e.target.value)}>
                <option value="auto">auto: Jev-compatible server if running, else the LLM stands in</option>
                <option value="jev">Jev-compatible server only (Laya, Clef, Jev)</option>
                <option value="llm">the local LLM</option>
              </select>
            </div>
            <div className="form-row">
              <label>Jev-compatible server (POST /v1/systemone)</label>
              <input className="input mono" value={clsUrl} onChange={(e) => setClsUrl(e.target.value)} />
              <span className="hint">
                For a fast on-device classifier: <span className="mono">pip install "laya[serve]" && laya-serve</span>
              </span>
            </div>
            <button className="btn" onClick={() => save({ llm_base_url: llmUrl, llm_model: llmModel, classifier_backend: clsBackend, classifier_url: clsUrl }, "Models updated")}>
              Save models
            </button>
            <div className="hint" style={{ marginTop: 12 }}>
              Now: LLM {status?.engine?.llm.ok ? status.engine.llm.model : `unavailable (${status?.engine?.llm.error ?? "?"})`} · decisions {status?.engine?.decision.backend ?? "unavailable"}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Neatlogs Cloud</h3>
            <span className="hint">{status?.cloud.has_key ? "API key stored" : "no API key"}</span>
          </div>
          <div className="card-body">
            <p className="hint" style={{ marginTop: 0 }}>
              Bolts sends runs the way the SDK does: OTLP to the public ingest endpoint with your key. Each send is redacted first and logged below.
            </p>
            <div className="form-row">
              <label>API key from app.neatlogs.com (stored in the macOS Keychain)</label>
              <div className="label-row" style={{ flexWrap: "nowrap" }}>
                <input className="input mono" type="password" value={key} placeholder={status?.cloud.has_key ? "•••••• stored" : "paste key"} onChange={(e) => setKey(e.target.value)} />
                <button
                  className="btn"
                  disabled={key.length < 8}
                  onClick={async () => {
                    await post("/api/cloud/key", { key });
                    setKey("");
                    toast("API key stored");
                    onChange();
                  }}
                >
                  Store
                </button>
                {status?.cloud.has_key && (
                  <button
                    className="btn ghost danger"
                    onClick={async () => {
                      await api("/api/cloud/key", { method: "DELETE" });
                      toast("API key removed");
                      onChange();
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className="form-row">
              <label>Ingest endpoint</label>
              <select className="input mono" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}>
                <option>https://ingest.neatlogs.com</option>
                <option>https://eu.ingest.neatlogs.com</option>
                {!endpoint.includes("neatlogs.com") && <option>{endpoint}</option>}
              </select>
            </div>
            <div className="form-row">
              <label>Extra redaction patterns (regex, one per line; emails, phone numbers and keys are always redacted)</label>
              <textarea className="input" rows={3} value={patterns} onChange={(e) => setPatterns(e.target.value)} placeholder={"cust_[0-9]+"} />
            </div>
            <button
              className="btn"
              onClick={() =>
                save({ cloud_endpoint: endpoint, ...(patterns.trim() ? { redact_patterns: patterns.split("\n").map((x) => x.trim()).filter(Boolean) } : {}) }, "Cloud settings saved")
              }
            >
              Save cloud settings
            </button>
            {(forwards.data?.forwards ?? []).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="hint" style={{ marginBottom: 6 }}>
                  Sent
                </div>
                {forwards.data!.forwards.slice(0, 8).map((f) => (
                  <div key={f.id} className="hint" style={{ display: "flex", gap: 10 }}>
                    <span style={{ color: f.status === "ok" ? "var(--ok)" : "var(--err)" }}>{f.status}</span>
                    <span className="mono">{f.trace_ids.map((t) => t.slice(0, 8)).join(", ")}</span>
                    <span>{f.span_count} spans</span>
                    <span>{f.redactions} redacted</span>
                    <span>{ago(f.created_ms)}</span>
                    {f.error && <span style={{ color: "var(--err)" }}>{f.error.slice(0, 80)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Coding agents (MCP)</h3>
          </div>
          <div className="card-body">
            <p className="hint" style={{ marginTop: 0 }}>
              Claude Code, Cursor, Codex and other MCP clients can read runs, get explanations and add checks.
            </p>
            <div className="form-row">
              <label>Claude Code</label>
              <div className="codeblock mono" style={{ margin: 0, maxWidth: "none" }}>
                {mcpClaude}
                <CopyButton text={mcpClaude} />
              </div>
            </div>
            <div className="form-row">
              <label>Streamable HTTP endpoint (any MCP client)</label>
              <div className="codeblock mono" style={{ margin: 0, maxWidth: "none" }}>
                {mcpHttp}
                <CopyButton text={mcpHttp} />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Storage</h3>
          </div>
          <div className="card-body">
            {status && (
              <>
                <div>
                  {status.stats.runs} runs · {status.stats.spans} spans · {status.stats.findings} findings · {bytes(status.stats.bytes)}
                </div>
                <div className="hint" style={{ marginTop: 6 }}>
                  Kept for {status.config.retention.days} days or up to {status.config.retention.maxGb} GB, oldest first. Pinned runs are kept.
                </div>
                <div className="hint mono" style={{ marginTop: 6 }}>
                  {status.home}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
