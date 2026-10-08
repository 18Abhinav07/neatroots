import { Activity01Icon, Alert02Icon, Search01Icon, SearchAreaIcon } from "@hugeicons/core-free-icons";
import { Button } from "../../../components/ui/button";
import { CodeLine } from "../../../components/ui/copy-button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia } from "../../../components/ui/empty";
import { Input, Select } from "../../../components/ui/field";
import { Icon } from "../../../components/ui/icon";
import { SegmentedTabs } from "../../../components/ui/segmented-tabs";
import { StatusDot } from "../../../components/ui/status-pill";
import type { Run } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { ago, dur, num } from "../../../lib/format";
import { RUN_STATE, runGoal } from "../_libs/labels";
import type { RunListParams } from "../_services/run-keys";

export function RunsList({
  runs,
  selected,
  params,
  setParams,
  projects,
}: {
  runs: Run[];
  selected?: string;
  params: RunListParams;
  setParams: (p: RunListParams) => void;
  projects: string[];
}) {
  const filtered = !!(params.q || params.status || params.hasFinding || params.project);
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-border px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-heading">Runs</h1>
          <span className="text-caption text-foreground-subtle tabular-nums">{runs.length ? `${runs.length} shown` : ""}</span>
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-foreground-subtle">
            <Icon icon={Search01Icon} size="xxs" />
          </span>
          <Input
            aria-label="Search runs"
            className="pl-8"
            placeholder="Search spans, tools, inputs"
            value={params.q}
            onChange={(e) => setParams({ ...params, q: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedTabs
            label="Run status"
            value={params.status}
            onChange={(status) => setParams({ ...params, status })}
            items={[
              { value: "", label: "All" },
              { value: "running", label: "Running" },
              { value: "error", label: "Failed" },
            ]}
          />
          <Button
            size="sm"
            variant={params.hasFinding ? "secondary" : "ghost"}
            aria-pressed={params.hasFinding}
            onClick={() => setParams({ ...params, hasFinding: !params.hasFinding })}
          >
            With findings
          </Button>
          {projects.length > 1 && (
            <Select aria-label="Project" className="h-7 w-auto text-label" value={params.project} onChange={(e) => setParams({ ...params, project: e.target.value })}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          )}
        </div>
      </div>
      <nav aria-label="Runs" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {runs.map((r) => (
          <RunRow key={r.trace_id} run={r} active={selected === r.trace_id} />
        ))}
        {!runs.length && filtered && (
          <Empty className="py-10">
            <EmptyMedia icon={SearchAreaIcon} />
            <EmptyHeader title="No runs match these filters" description="Clear the filters to see every run Bolts has recorded." />
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={() => setParams({ q: "", status: "", hasFinding: false, project: "" })}>
                Clear filters
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </nav>
    </div>
  );
}

function RunRow({ run: r, active }: { run: Run; active: boolean }) {
  const state = RUN_STATE[r.status];
  const name = r.root_name ?? r.workflow ?? r.trace_id.slice(0, 8);
  const goal = runGoal(r);
  return (
    <a
      href={`#/runs/${r.trace_id}`}
      aria-current={active ? "page" : undefined}
      className={cn("focus-ring flex flex-col gap-1 rounded-md px-3 py-2.5 transition-colors motion-fast", active ? "bg-surface-strong" : "hover:bg-surface-subtle")}
    >
      <span className="flex items-center gap-2">
        <StatusDot tone={state.tone} label={state.label} />
        <span className="min-w-0 flex-1 truncate text-body-medium text-foreground">{goal ?? name}</span>
        <span className="shrink-0 text-caption text-foreground-subtle tabular-nums">{ago(r.started_ms)}</span>
      </span>
      {r.top_finding && (
        <span className="flex items-center gap-1.5 pl-4 text-caption text-foreground" title={`${r.open_finding_count} open problem(s)`}>
          <Icon icon={Alert02Icon} size="xs" className="shrink-0 text-warning-fg" />
          <span className="truncate">{r.top_finding}</span>
          {r.open_finding_count > 1 && <span className="shrink-0 text-foreground-subtle tabular-nums">+{r.open_finding_count - 1}</span>}
        </span>
      )}
      <span className="flex gap-1.5 truncate pl-4 text-caption text-foreground-subtle tabular-nums">
        <span className="truncate">{goal ? name : r.workflow}</span>
        <span aria-hidden className="text-foreground-faint">
          ·
        </span>
        <span>{r.status === "running" ? "running" : dur(r.duration_ms)}</span>
        <span aria-hidden className="text-foreground-faint">
          ·
        </span>
        <span>{num(r.span_count)} spans</span>
      </span>
    </a>
  );
}

/** First run: Bolts has never received a trace. This surface owns setup. */
export function FirstRunEmpty({ port, llmOk, llmUrl }: { port: number; llmOk: boolean; llmUrl?: string }) {
  return (
    <Empty className="min-h-full">
      <EmptyMedia icon={Activity01Icon} />
      <EmptyHeader title="No runs yet" description="Point the Neatlogs SDK at Bolts and run your agent. Its runs appear here as they happen, and nothing leaves this machine." />
      <EmptyContent>
        <div className="flex w-full flex-col gap-2 text-left">
          <CodeLine text={`export NEATLOGS_ENDPOINT=http://localhost:${port}\nexport NEATLOGS_API_KEY=bolts-local`} />
          <CodeLine text={`neatlogs.init(workflow_name="my-agent", flush_interval=0.5)`} />
          <span className="text-caption text-foreground-subtle">
            Already instrumented? Setting the two variables is enough. Check the path with <code className="font-mono">neatlogs doctor --probe</code>.
          </span>
          {!llmOk && (
            <span className="text-caption text-warning-fg">No local LLM at {llmUrl}. Rules still run; start Ollama or LM Studio for questions, explanations and notes.</span>
          )}
        </div>
      </EmptyContent>
    </Empty>
  );
}
