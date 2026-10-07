import type { Run } from "../api";
import { ago, dur, num } from "../format";
import { BoltIcon, StatusGlyph } from "./bits";

interface Filters {
  q: string;
  status: string;
  findings: boolean;
  project: string;
}

export function RunsRail({
  runs,
  selected,
  filters,
  setFilters,
  tick,
}: {
  runs: Run[];
  selected?: string;
  filters: Filters;
  setFilters: (f: Filters) => void;
  tick: number;
}) {
  void tick;
  const projects = [...new Set(runs.map((r) => r.project).filter(Boolean))] as string[];
  return (
    <aside className="rail">
      <div className="rail-head">
        <div className="rail-title">
          <h2>Runs</h2>
          <span className="hint">{runs.length ? `${runs.length} shown` : ""}</span>
        </div>
        <input
          className="input"
          placeholder="Search spans, tools, inputs…"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
        <div className="filters">
          {["", "running", "error"].map((s) => (
            <button key={s || "all"} className={`toggle-pill ${filters.status === s ? "on" : ""}`} onClick={() => setFilters({ ...filters, status: s })}>
              {s || "all"}
            </button>
          ))}
          <button className={`toggle-pill ${filters.findings ? "on" : ""}`} onClick={() => setFilters({ ...filters, findings: !filters.findings })}>
            ⚡ flagged
          </button>
          {projects.length > 1 && (
            <select className="toggle-pill" value={filters.project} onChange={(e) => setFilters({ ...filters, project: e.target.value })}>
              <option value="">all projects</option>
              {projects.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="run-list">
        {runs.map((r, i) => (
          <a key={r.trace_id} href={`#/runs/${r.trace_id}`} className={`run-item ${selected === r.trace_id ? "active" : ""}`} style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}>
            <span className="glyph">
              <StatusGlyph status={r.status} />
            </span>
            <span className="name">{r.root_name ?? r.workflow ?? r.trace_id.slice(0, 8)}</span>
            <span className="right">
              {r.open_finding_count > 0 ? (
                <span className="flag-count" title={`${r.open_finding_count} open finding(s)`}>
                  <BoltIcon size={12} />
                  {r.open_finding_count}
                </span>
              ) : r.finding_count > 0 ? (
                <span className="muted" title="findings, none open">
                  {r.finding_count}
                </span>
              ) : null}
            </span>
            <span className="meta" style={{ gridColumn: "2 / span 2" }}>
              <span>{r.workflow}</span>
              <span>·</span>
              <span>{ago(r.started_ms)}</span>
              <span>·</span>
              <span>{r.status === "running" ? "running" : dur(r.duration_ms)}</span>
              <span>·</span>
              <span>{num(r.span_count)} spans</span>
            </span>
            {(r.summary || r.input_preview) && <span className="preview">{(r.summary ?? r.input_preview ?? "").split("\n")[0]}</span>}
          </a>
        ))}
        {!runs.length && (filters.q || filters.status || filters.findings) && <p className="hint" style={{ padding: 14 }}>No runs match these filters.</p>}
      </div>
    </aside>
  );
}
