import { useState } from "react";
import { toast } from "sonner";
import { PendingButton } from "@/components/pending-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { pct } from "@/lib/format";
import { go } from "@/lib/router";
import { useCheckActions, type PreviewResult } from "../_services/check-queries";

/** Write a check: describe it, let the LLM draft the YAML, preview it on recent runs, save. */
export function CheckEditor({ open, initialYaml, userDir, onClose }: { open: boolean; initialYaml: string; userDir?: string; onClose: () => void }) {
  const a = useCheckActions();
  const [concern, setConcern] = useState("");
  const [yaml, setYaml] = useState(initialYaml);
  const [preview, setPreview] = useState<PreviewResult>();
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="gap-1 border-b border-border px-6 py-4 pr-12">
          <SheetTitle className="text-base font-normal">{initialYaml ? "Edit a copy" : "New check"}</SheetTitle>
          <SheetDescription className="text-xs">
            Saved to <span className="font-mono">{userDir ?? "~/.neatroots/checks"}</span>. To share checks with your team, run <span className="font-mono">neatroots init</span> in
            your repo.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          <Field>
            <FieldLabel htmlFor="concern">Describe a problem in plain language</FieldLabel>
            <Textarea
              id="concern"
              rows={3}
              placeholder="The agent refunds without checking the customer owns the order"
              value={concern}
              onChange={(e) => setConcern(e.target.value)}
            />
            <div>
              <PendingButton
                variant="secondary"
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
              </PendingButton>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="check-yaml">Check (YAML)</FieldLabel>
            <Textarea
              id="check-yaml"
              rows={14}
              className="h-72 resize-none font-mono text-xs"
              value={yaml}
              onChange={(e) => setYaml(e.target.value)}
              placeholder={"id: my-check\nkind: yes_no\nscope: trace\nask: Did the agent ...?\nflag_at: 0.8"}
            />
          </Field>
          {preview && (
            <div className="flex flex-col gap-1.5 rounded-lg bg-surface-subtle px-3 py-2.5">
              <span className="text-sm text-foreground tabular-nums">
                Fires on {preview.hits.length} of {preview.checked} runs · hit rate {pct(preview.hit_rate)}
                {preview.truncated ? ` (stopped early; ${preview.total} available)` : ""}
              </span>
              <div className="flex max-h-40 flex-col overflow-y-auto">
                {preview.hits.map((h) => (
                  <button
                    key={h.trace_id}
                    type="button"
                    onClick={() => go(`runs/${h.trace_id}`)}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground"
                  >
                    <span className="font-mono">{h.trace_id.slice(0, 8)}</span>
                    <span className="truncate">{h.root_name}</span>
                    {h.probability !== null && <span className="ml-auto tabular-nums">{pct(h.probability)}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <PendingButton
            variant="secondary"
            disabled={!yaml}
            pending={a.preview.isPending}
            pendingLabel="Previewing…"
            onClick={() => a.preview.mutate(yaml, { onSuccess: setPreview, onError: (e) => toast.error(`Couldn't preview the check: ${(e as Error).message}`) })}
          >
            Preview on recent runs
          </PendingButton>
          <PendingButton
            disabled={!yaml}
            pending={a.save.isPending}
            onClick={() =>
              a.save.mutate(yaml, {
                onSuccess: (r) => {
                  toast.success(`Saved ${r.id} to ${r.path}`);
                  onClose();
                },
                onError: (e) => toast.error(`Couldn't save the check: ${(e as Error).message}. Your YAML is still in the editor.`),
              })
            }
          >
            Save check
          </PendingButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
