import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Field, Textarea } from "../../../components/ui/field";
import { Panel } from "../../../components/ui/panel";
import { pct } from "../../../lib/format";
import { go } from "../../../lib/router";
import { useCheckActions, useChecks, type PreviewResult } from "../_services/check-queries";
import { CheckList } from "./check-list";

export function ChecksPage() {
  const { data } = useChecks();
  const a = useCheckActions();
  const [concern, setConcern] = useState("");
  const [yaml, setYaml] = useState("");
  const [preview, setPreview] = useState<PreviewResult>();
  const [editing, setEditing] = useState(false);
  const close = () => {
    setEditing(false);
    setYaml("");
    setConcern("");
    setPreview(undefined);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display">Checks</h1>
          <p className="max-w-2xl text-body text-muted-foreground">
            Everything Bolts watches for. Rules run in code on every span. Questions go to the decision model, and the planner picks the ones that fit each agent.
          </p>
        </div>
        {!editing && <Button onClick={() => setEditing(true)}>New check</Button>}
      </header>
      {!!data?.errors.length && (
        <div role="alert" className="flex flex-col gap-1 rounded-lg border border-danger-border bg-danger-surface px-4 py-3">
          <span className="text-body-strong text-danger-fg">Some check files didn't load</span>
          {data.errors.map((e, i) => (
            <span key={i} className="font-mono text-xs text-danger-fg">
              {e.path}
              {e.id ? ` (${e.id})` : ""}: {e.message}
            </span>
          ))}
        </div>
      )}
      <div className={editing ? "grid items-start gap-6 lg:grid-cols-[1fr_400px]" : "flex flex-col"}>
        <CheckList
          checks={data?.checks ?? []}
          onToggle={(id, enabled) => a.toggle.mutate({ id, enabled })}
          onEdit={(y) => {
            setYaml(y);
            setPreview(undefined);
            setEditing(true);
          }}
          onDelete={(id) => a.remove.mutate(id, { onSuccess: () => toast.success(`Deleted check ${id}`) })}
        />
        {editing && (
          <Panel
            title={yaml && !concern ? "Edit check" : "New check"}
            className="lg:sticky lg:top-6"
            actions={
              <Button size="sm" variant="ghost" onClick={close}>
                Close
              </Button>
            }
          >
            <div className="flex flex-col gap-4 px-4 py-4">
              <Field label="Describe a problem in plain language" htmlFor="concern" hint="The local LLM turns it into a yes/no question.">
                <Textarea
                  id="concern"
                  rows={3}
                  placeholder="The agent refunds without checking the customer owns the order"
                  value={concern}
                  onChange={(e) => setConcern(e.target.value)}
                />
              </Field>
              <div>
                <Button
                  variant="outline"
                  disabled={concern.trim().length < 8}
                  pending={a.draft.isPending}
                  pendingLabel="Drafting…"
                  onClick={() =>
                    a.draft.mutate(concern, {
                      onSuccess: (r) => {
                        setYaml(r.yaml);
                        setPreview(undefined);
                      },
                      onError: (e) => toast.error(`Couldn't draft the check: ${(e as Error).message}. Your description is still here.`),
                    })
                  }
                >
                  Draft check
                </Button>
              </div>
              <Field label="Check (YAML)" htmlFor="check-yaml" hint="Edit freely, or paste your own.">
                <Textarea
                  id="check-yaml"
                  mono
                  rows={14}
                  value={yaml}
                  onChange={(e) => setYaml(e.target.value)}
                  placeholder={"id: my-check\nkind: yes_no\nscope: trace\nask: Did the agent ...?\nflag_at: 0.8"}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!yaml}
                  pending={a.preview.isPending}
                  pendingLabel="Previewing…"
                  onClick={() => a.preview.mutate(yaml, { onSuccess: setPreview, onError: (e) => toast.error(`Couldn't preview the check: ${(e as Error).message}`) })}
                >
                  Preview on recent runs
                </Button>
                <Button
                  disabled={!yaml}
                  pending={a.save.isPending}
                  onClick={() =>
                    a.save.mutate(yaml, {
                      onSuccess: (r) => {
                        toast.success(`Saved ${r.id} to ${r.path}`);
                        close();
                      },
                      onError: (e) => toast.error(`Couldn't save the check: ${(e as Error).message}. Your YAML is still in the editor.`),
                    })
                  }
                >
                  Save check
                </Button>
              </div>
              {preview && (
                <div className="flex flex-col gap-1.5 rounded-md bg-surface-subtle px-3 py-2.5">
                  <span className="text-body text-foreground tabular-nums">
                    Fires on {preview.hits.length} of {preview.checked} runs · hit rate {pct(preview.hit_rate)}
                    {preview.truncated ? ` (stopped early; ${preview.total} available)` : ""}
                  </span>
                  {preview.hits.slice(0, 8).map((h) => (
                    <button
                      key={h.trace_id}
                      type="button"
                      onClick={() => go(`runs/${h.trace_id}`)}
                      className="focus-ring cursor-pointer text-left text-caption text-muted-foreground hover:text-foreground"
                    >
                      <span className="font-mono">{h.trace_id.slice(0, 8)}</span> {h.root_name} {h.probability !== null ? `· ${pct(h.probability)}` : ""}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-caption text-foreground-subtle">
                Saved to <span className="font-mono">{data?.user_dir ?? "~/.bolts/checks"}</span>. To share checks with your team, run <span className="font-mono">bolts init</span>{" "}
                in your repo and keep them in <span className="font-mono">.bolts/checks/</span>.
              </p>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
