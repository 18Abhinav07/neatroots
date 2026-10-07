import { useEffect, useState } from "react";
import type { Status } from "../../../lib/api";
import { go } from "../../../lib/router";
import type { RunListParams } from "../_services/run-keys";
import { useRuns } from "../_services/run-queries";
import { RunDetail } from "./run-detail";
import { FirstRunEmpty, RunsList } from "./runs-list";

export function RunsPage({ runId, status }: { runId?: string; status?: Status }) {
  const [params, setParams] = useState<RunListParams>({ q: "", status: "", hasFinding: false, project: "" });
  const { data } = useRuns(params);
  const runs = data?.runs ?? [];
  const neverReceived = data !== undefined && data.total === 0;
  const projects = [...new Set(runs.map((r) => r.project).filter(Boolean))] as string[];

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
