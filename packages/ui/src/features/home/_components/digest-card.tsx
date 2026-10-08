import { AiBrain01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef } from "react";
import { Button } from "../../../components/ui/button";
import { Icon } from "../../../components/ui/icon";
import { Spinner } from "../../../components/ui/spinner";
import { StatusDot } from "../../../components/ui/status-pill";
import type { Insights } from "../../../lib/api";
import { ago } from "../../../lib/format";
import { useWriteDigest } from "../_services/home-queries";

const TONE = { good: "success", bad: "warning", neutral: "neutral" } as const;

/**
 * The LLM's reading of the numbers below it: what stands out, in a few sentences. It sees
 * aggregates only, and a sentence quoting a number that is not in the data is dropped.
 */
export function DigestCard({ data, llmOk }: { data: Insights; llmOk: boolean | undefined }) {
  const write = useWriteDigest(data.window.key);
  const asked = useRef<string | null>(null);
  const d = data.digest;
  const pending = write.isPending || data.digest_pending;

  // Write one the first time this period is opened, when there is something to read.
  useEffect(() => {
    if (!d && llmOk && data.totals.runs > 0 && !pending && asked.current !== data.window.key) {
      asked.current = data.window.key;
      write.mutate();
    }
  }, [d, llmOk, data.totals.runs, data.window.key, pending, write]);

  const newRuns = d ? data.totals.runs - d.runs : 0;
  return (
    <section aria-labelledby="digest" className="flex flex-col gap-3 rounded-lg bg-surface-subtle px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="digest" className="inline-flex items-center gap-1.5 text-title text-foreground">
          <Icon icon={AiBrain01Icon} size="sm" className="text-brand-violet" />
          What stands out
        </h2>
        <span className="flex items-center gap-2 text-caption text-foreground-subtle">
          {d && (
            <span>
              {d.model ?? "LLM"}
              {d.where && d.where !== "local" ? ` (${d.where})` : ""} · {ago(d.created_ms)}
              {newRuns > 0 ? ` · ${newRuns} new run${newRuns === 1 ? "" : "s"} since` : ""}
            </span>
          )}
          {llmOk && data.totals.runs > 0 && (
            <Button size="sm" variant="ghost" pending={pending} pendingLabel="Reading…" onClick={() => write.mutate()}>
              {d ? "Refresh summary" : "Write summary"}
            </Button>
          )}
        </span>
      </div>
      {d ? (
        <div className="grid gap-4 md:grid-cols-2">
          {(["bad", "good"] as const).map((tone) => {
            const items = d.insights.filter((x) => (tone === "bad" ? x.tone === "bad" : x.tone !== "bad"));
            if (!items.length) return null;
            return (
              <div key={tone} className="flex flex-col gap-2">
                <span className="text-label text-muted-foreground">{tone === "bad" ? "Not working" : "Working"}</span>
                <ul className="flex flex-col gap-2">
                  {items.map((x, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-body text-foreground">
                      <span className="pt-1.5">
                        <StatusDot tone={TONE[x.tone]} label={tone === "bad" ? "Not working" : "Working"} />
                      </span>
                      {x.text}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : pending ? (
        <p className="flex items-center gap-2 text-body text-muted-foreground">
          <Spinner size="xs" label="" />
          The LLM is reading this period's numbers…
        </p>
      ) : write.isError ? (
        <p className="text-body text-muted-foreground">Couldn't write a summary: {(write.error as Error).message}</p>
      ) : llmOk === undefined ? null : (
        <p className="text-body text-muted-foreground">
          {llmOk ? "No summary for this period yet." : "With an LLM available, Bolts writes a short summary of what changed. The numbers below don't need one."}
        </p>
      )}
    </section>
  );
}
