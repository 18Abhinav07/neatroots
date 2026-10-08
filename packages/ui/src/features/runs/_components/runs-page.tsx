import { Activity01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Empty, EmptyHeader, EmptyMedia } from "../../../components/ui/empty";
import type { Status } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { go } from "../../../lib/router";
import type { RunListParams } from "../_services/run-keys";
import { useRuns } from "../_services/run-queries";
import { useProjects } from "../../settings/_services/settings-queries";
import { RunDetail } from "./run-detail";
import { FirstRunEmpty, RunsList } from "./runs-list";

/** Filters a link can set: #/runs?project=…, or ?check=…&label=… for runs with one problem. */
function fromQuery(q: URLSearchParams): Partial<RunListParams> {
  return { project: q.get("project") ?? "", check: q.get("check") ?? undefined, label: q.get("label") ?? undefined };
}

/**
 * The run list and the open run, side by side. Each pane scrolls on its own, so the list
 * never scrolls away. On narrow screens one pane shows at a time.
 */
export function RunsPage({ runId, status, query }: { runId?: string; status?: Status; query: URLSearchParams }) {
  const [params, setParams] = useState<RunListParams>(() => ({ q: "", status: "", hasFinding: false, project: "", ...fromQuery(query) }));
  const qs = query.toString();
  // A new link with filters replaces the current ones; opening a run (no query) keeps them.
  useEffect(() => {
    const q = new URLSearchParams(qs);
    if (q.has("project") || q.has("check")) setParams((p) => ({ ...p, ...fromQuery(q) }));
  }, [qs]);
  const { data } = useRuns(params);
  const runs = data?.runs ?? [];
  const neverReceived = data !== undefined && data.total === 0;
  const { data: known } = useProjects();
  const projects = [...new Set([...(known?.projects ?? []).map((p) => p.project), params.project].filter(Boolean))] as string[];

  // Open the newest run when nothing is selected, where both panes fit.
  useEffect(() => {
    if (!runId && runs[0] && window.innerWidth >= 1024) go(`runs/${runs[0].trace_id}`);
  }, [runId, runs]);

  if (neverReceived) {
    return (
      <main className="h-full overflow-y-auto">
        <FirstRunEmpty port={status?.port ?? 4100} llmOk={!!status?.engine?.llm.ok} llmUrl={status?.config.llm.baseUrl} />
      </main>
    );
  }
  return (
    <div className="flex h-full min-h-0">
      <aside className={cn("flex h-full min-h-0 w-full shrink-0 flex-col border-r border-border/60 lg:w-[22rem] xl:w-[24rem]", runId && "max-lg:hidden")}>
        <RunsList runs={runs} total={data?.total} selected={runId} params={params} setParams={setParams} projects={projects} />
      </aside>
      <main className={cn("h-full min-w-0 flex-1 overflow-y-auto", !runId && "max-lg:hidden")}>
        {runId ? (
          <RunDetail key={runId} traceId={runId} />
        ) : (
          <Empty className="h-full">
            <EmptyMedia icon={Activity01Icon} />
            <EmptyHeader title="Select a run" description="Pick a run on the left to see what it was asked, what went wrong and the trace." />
          </Empty>
        )}
      </main>
    </div>
  );
}
