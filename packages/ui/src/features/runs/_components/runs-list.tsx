import { Activity01Icon, Alert02Icon, Cancel01Icon, Search01Icon, SearchAreaIcon } from "@hugeicons/core-free-icons";
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
  total,
  selected,
  params,
  setParams,
  projects,
}: {
  runs: Run[];
  total?: number;
  selected?: string;
  params: RunListParams;
  setParams: (p: RunListParams) => void;
  projects: string[];
}) {
  const filtered = !!(params.q || params.status || params.hasFinding || params.project || params.check);
  return (
    <>
      <div className="flex shrink-0 flex-col gap-3 border-b border-border/60 px-4 pt-3 pb-3">
        <div className="flex h-7 items-center justify-between gap-2">
          <h1 className="text-base text-foreground">Runs</h1>
          <span className="text-caption text-foreground-subtle tabular-nums">{filtered ? `${runs.length} match` : total !== undefined ? `${num(total)} total` : ""}</span>
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-foreground-subtle">
            <Icon icon={Search01Icon} size="xxs" />
          </span>
          <Input
            aria-label="Search runs"
            className="pl-8"
            placeholder="Search requests, tools, outputs"
            value={params.q}
            onChange={(e) => setParams({ ...params, q: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <SegmentedTabs
            label="Run status"
            variant="pill"
            value={params.hasFinding ? "problems" : params.status || "all"}
            onValueChange={(v) => setParams({ ...params, status: v === "running" || v === "error" ? v : "", hasFinding: v === "problems" })}
            items={[
              { value: "all", label: "All" },
              { value: "problems", label: "With problems" },
              { value: "error", label: "Failed" },
              { value: "running", label: "Running" },
            ]}
          />
          {projects.length > 1 && (
            <Select aria-label="Project" className="h-7 w-auto rounded-full text-xs" value={params.project} onChange={(e) => setParams({ ...params, project: e.target.value })}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          )}
        </div>
        {params.check && (
          <div className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-surface-subtle py-1 pr-1 pl-2.5 text-caption text-foreground">
            <span className="min-w-0 truncate" title={params.label ?? params.check}>
              Problem: {params.label ?? params.check}
            </span>
            <Button
              size="icon-sm"
              variant="muted"
              className="size-6"
              aria-label="Clear the problem filter"
              onClick={() => setParams({ ...params, check: undefined, label: undefined })}
            >
              <Icon icon={Cancel01Icon} size="xxs" />
            </Button>
          </div>
        )}
      </div>
      <nav aria-label="Runs" className="min-h-0 flex-1 overflow-y-auto">
        {runs.map((r) => (
          <RunRow key={r.trace_id} run={r} active={selected === r.trace_id} />
        ))}
        {!runs.length && filtered && (
          <Empty className="py-10">
            <EmptyMedia icon={SearchAreaIcon} />
            <EmptyHeader title="No runs match" description="Clear the filters to see every run Bolts has recorded." />
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={() => setParams({ q: "", status: "", hasFinding: false, project: "" })}>
                Clear filters
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </nav>
    </>
  );
}

/** One run: what it was asked, the top problem if any, and how it ran. Every line starts under the request. */
function RunRow({ run: r, active }: { run: Run; active: boolean }) {
  const state = RUN_STATE[r.status];
  const name = r.root_name ?? r.workflow ?? r.trace_id.slice(0, 8);
  const goal = runGoal(r);
  return (
    <a
      href={`#/runs/${r.trace_id}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring grid grid-cols-[0.5rem_1fr] gap-x-3 gap-y-1 border-b border-border/60 px-4 py-3 transition-colors motion-fast",
        active ? "bg-surface-strong" : "hover:bg-surface-subtle",
      )}
    >
      <span className="flex h-5 items-center">
        <StatusDot tone={state.tone} label={state.label} />
      </span>
      <span className="flex min-w-0 items-baseline justify-between gap-3">
        <span className="truncate text-body text-foreground">{goal ?? name}</span>
        <span className="shrink-0 text-caption text-foreground-subtle tabular-nums">{ago(r.started_ms)}</span>
      </span>
      {r.top_finding && (
        <span className="col-start-2 flex min-w-0 items-center gap-1.5 text-caption text-warning-fg" title={`${r.open_finding_count} open problem(s)`}>
          <Icon icon={Alert02Icon} size="xs" className="shrink-0" />
          <span className="truncate">{r.top_finding}</span>
          {r.open_finding_count > 1 && <span className="shrink-0 text-foreground-subtle tabular-nums">+{r.open_finding_count - 1}</span>}
        </span>
      )}
      <span className="col-start-2 truncate text-caption text-foreground-subtle tabular-nums">
        {goal ? name : r.workflow} · {r.status === "running" ? "running" : dur(r.duration_ms)} · {num(r.span_count)} spans
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
