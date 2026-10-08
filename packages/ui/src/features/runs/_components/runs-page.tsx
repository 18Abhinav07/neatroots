import { useEffect, useState } from "react";
import type { Status } from "../../../lib/api";
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

  // Open the newest run when nothing is selected (wide screens only).
  useEffect(() => {
    if (!runId && runs[0] && window.innerWidth >= 1024) go(`runs/${runs[0].trace_id}`);
  }, [runId, runs]);

  if (neverReceived) {
    return (
      <main className="min-h-0 overflow-y-auto">
        <FirstRunEmpty port={status?.port ?? 4100} llmOk={!!status?.engine?.llm.ok} llmUrl={status?.config.llm.baseUrl} />
      </main>
    );
  }
  return (
    <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[340px_1fr]">
      <aside className="flex min-h-0 flex-col border-border max-lg:max-h-[45vh] max-lg:border-b lg:border-r">
        <RunsList runs={runs} selected={runId} params={params} setParams={setParams} projects={projects} />
      </aside>
      <main className="min-h-0 overflow-y-auto">{runId ? <RunDetail key={runId} traceId={runId} /> : null}</main>
    </div>
  );
}
