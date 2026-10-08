import type { Insights } from "../../../lib/api";
import { ago, num } from "../../../lib/format";

/** One row per project: how much it ran and how often its runs went wrong. */
export function ProjectsTable({ data }: { data: Insights }) {
  if (!data.projects.length) return null;
  return (
    <section aria-labelledby="projects" className="flex flex-col gap-3">
      <h2 id="projects" className="text-eyebrow text-muted-foreground">
        Projects
      </h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border/60 text-left text-eyebrow text-muted-foreground">
              <th className="px-4 py-2.5 font-normal">Project</th>
              <th className="px-4 py-2 text-right font-normal">Runs</th>
              <th className="px-4 py-2.5 font-normal">With problems</th>
              <th className="px-4 py-2 text-right font-normal">Failed</th>
              <th className="px-4 py-2.5 font-normal">Most common problem</th>
              <th className="px-4 py-2 text-right font-normal">Last run</th>
            </tr>
          </thead>
          <tbody>
            {data.projects.map((p) => {
              const share = p.runs ? p.with_problems / p.runs : 0;
              return (
                <tr key={p.name} className="border-b border-border/60 last:border-0 hover:bg-surface-subtle">
                  <td className="px-4 py-2">
                    <a href={`#/runs?project=${encodeURIComponent(p.name)}`} className="focus-ring rounded-sm text-foreground underline-offset-4 hover:underline">
                      {p.name}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {num(p.runs)}
                    {data.previous.runs > 0 && <span className="ml-1.5 text-caption text-foreground-subtle">was {num(p.prev_runs)}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2 tabular-nums">
                      <span aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-track">
                        <span className="block h-full rounded-full bg-warning-fg" style={{ width: `${Math.round(share * 100)}%` }} />
                      </span>
                      <span className="text-muted-foreground">
                        {Math.round(share * 100)}% <span className="text-foreground-subtle">({num(p.with_problems)})</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {p.failed ? <span className="text-danger-fg">{num(p.failed)}</span> : <span className="text-foreground-subtle">0</span>}
                  </td>
                  <td className="max-w-72 truncate px-4 py-2 text-muted-foreground" title={p.top_problem ?? undefined}>
                    {p.top_problem ?? <span className="text-foreground-subtle">none</span>}
                  </td>
                  <td className="px-4 py-2 text-right text-caption text-foreground-subtle tabular-nums">{ago(p.last_ms)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
