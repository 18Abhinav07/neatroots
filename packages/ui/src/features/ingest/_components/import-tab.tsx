import { Upload01Icon } from "@hugeicons/core-free-icons";
import { useRef, useState } from "react";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusPill } from "@/components/ui/status-pill";
import type { ImportSourceInfo } from "@/lib/api";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useImportActions, useImportJobs, useImportSources } from "../_services/ingest-queries";

const WINDOWS = [
  { label: "24 hours", ms: 86_400_000 },
  { label: "7 days", ms: 7 * 86_400_000 },
  { label: "30 days", ms: 30 * 86_400_000 },
];

function FileDrop() {
  const { file } = useImportActions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const read = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) file.mutate({ name: f.name, content: await f.text() });
  };
  return (
    <div
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void read(e.dataTransfer.files);
      }}
      className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors", over ? "border-foreground/40 bg-surface-subtle" : "border-border")}
    >
      <Icon icon={Upload01Icon} size="md" className="text-muted-foreground" />
      <span className="text-sm text-foreground">Drop trace files here</span>
      <span className="max-w-md text-xs text-muted-foreground">OTLP JSON (an exporter's file output or a collector dump), Neatlogs Cloud trace exports, or Neatlogs HTTP traces. One per file, or one per line in .jsonl.</span>
      <input ref={inputRef} type="file" accept=".json,.jsonl,.ndjson,application/json" multiple className="hidden" onChange={(e) => void read(e.target.files)} />
      <PendingButton size="sm" variant="secondary" pending={file.isPending} onClick={() => inputRef.current?.click()}>
        Choose files
      </PendingButton>
    </div>
  );
}

function SourceForm({ source, onClose }: { source: ImportSourceInfo; onClose: () => void }) {
  const { start } = useImportActions();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(source.fields.map((f) => [f.name, f.default ?? ""])));
  const [win, setWin] = useState(WINDOWS[1].ms);
  const [limit, setLimit] = useState("100");
  const [project, setProject] = useState("");
  const missing = source.fields.some((f) => f.required && !values[f.name]?.trim());
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {source.fields.map((f) => (
          <label key={f.name} className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              {f.label}
              {f.required ? "" : " (optional)"}
            </span>
            <Input
              type={f.secret ? "password" : "text"}
              className={cn("h-8", !f.secret && "font-mono text-xs")}
              placeholder={f.placeholder}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Local project name (optional)</span>
          <Input className="h-8" placeholder="keep the source's names" value={project} onChange={(e) => setProject(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Most traces</span>
          <Input className="h-8" type="number" min={1} max={5000} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">From the last</span>
        {WINDOWS.map((w) => (
          <Button key={w.ms} size="sm" variant={win === w.ms ? "secondary" : "ghost"} onClick={() => setWin(w.ms)}>
            {w.label}
          </Button>
        ))}
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <PendingButton
            size="sm"
            disabled={missing}
            pending={start.isPending}
            onClick={() => start.mutate({ source: source.id, values, since_ms: Date.now() - win, limit: Number(limit) || 100, project: project || undefined }, { onSuccess: onClose })}
          >
            Import from {source.label}
          </PendingButton>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Keys are used for this import only and aren't stored. Re-importing skips traces you already have.</p>
    </div>
  );
}

export function ImportTab() {
  const { data: sources } = useImportSources();
  const { data: jobs } = useImportJobs();
  const { cancel } = useImportActions();
  const [open, setOpen] = useState<string>();
  const list = (sources?.sources ?? []).filter((s) => s.id !== "neatlogs-cloud");
  return (
    <div className="flex flex-col gap-4">
      <FileDrop />
      <Card className="shadow-none">
        <CardHeader className="gap-1 pb-4">
          <CardTitle className="font-pixel text-2xs tracking-caps-wide text-muted-foreground uppercase">From another tool</CardTitle>
          <p className="text-sm text-muted-foreground">Bring traces you already have into neatroots to check, explain and replay them here. Pulled through each tool's API, straight to this machine.</p>
        </CardHeader>
        <CardContent className="flex flex-col p-0">
          {list.map((s) => (
            <div key={s.id} className="border-t border-border px-6 py-3">
              <div className="flex min-h-10 items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm text-foreground">{s.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{s.description}</span>
                </span>
                {open !== s.id && (
                  <Button size="sm" variant="secondary" onClick={() => setOpen(s.id)}>
                    Set up import
                  </Button>
                )}
              </div>
              {open === s.id && <SourceForm source={s} onClose={() => setOpen(undefined)} />}
            </div>
          ))}
        </CardContent>
      </Card>
      {!!jobs?.jobs.length && (
        <Card className="shadow-none">
          <CardHeader className="pb-4">
            <CardTitle className="font-pixel text-2xs tracking-caps-wide text-muted-foreground uppercase">Imports</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="flex max-h-80 flex-col overflow-y-auto border-t border-border">
              {jobs.jobs.map((j) => (
                <li key={j.id} className="flex min-h-12 items-center gap-3 border-b border-border/60 px-6 py-2 text-sm last:border-0">
                  {j.state === "running" ? (
                    <Spinner size="xs" />
                  ) : (
                    <StatusPill size="sm" tone={j.state === "succeeded" ? "success" : j.state === "cancelled" ? "muted" : "danger"}>
                      {j.state === "succeeded" ? "Done" : j.state === "cancelled" ? "Cancelled" : "Failed"}
                    </StatusPill>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-foreground tabular-nums">
                      {j.label} · {j.traces} runs, {j.spans} spans{j.failed ? `, ${j.failed} failed` : ""}
                    </span>
                    {j.last_error && <span className="truncate text-xs text-danger-fg">{j.last_error}</span>}
                  </span>
                  {j.state === "running" ? (
                    <Button size="sm" variant="ghost" onClick={() => cancel.mutate(j.id)}>
                      Cancel import
                    </Button>
                  ) : j.trace_ids.length ? (
                    <a href={`#/runs/${j.trace_ids[0]}`} className="text-xs text-foreground underline-offset-4 hover:underline">
                      Open a run
                    </a>
                  ) : null}
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">{ago(j.started_ms)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
