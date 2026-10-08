import { toast } from "sonner";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import type { ForwardPreview } from "../../../lib/api";

/** Confirms a send to Neatlogs Cloud with the redaction preview in view. */
export function ForwardDialog({
  preview,
  pending,
  onSend,
  onClose,
}: {
  preview: ForwardPreview | undefined;
  pending: boolean;
  onSend: () => Promise<{ status: string; span_count: number; error: string | null }>;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open={!!preview}
      title="Send this run to Neatlogs Cloud?"
      description={preview ? `${preview.span_count} spans go to ${preview.endpoint} with your API key. Redactions below are applied first; the send is logged in Settings.` : ""}
      confirmLabel="Send run to Cloud"
      pending={pending}
      onClose={onClose}
      onConfirm={async () => {
        const r = await onSend().catch((e: Error) => ({ status: "error", span_count: 0, error: e.message }));
        if (r.status === "ok") toast.success(`Sent ${r.span_count} spans to Neatlogs Cloud`);
        else toast.error(`Couldn't send the run to Neatlogs Cloud: ${r.error ?? "unknown error"}. Nothing was changed locally; retry from the run.`);
        onClose();
      }}
    >
      {preview && (
        <ul className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-caption text-muted-foreground">
          {preview.redactions.length === 0 ? (
            <li>No emails, phone numbers or keys found to redact.</li>
          ) : (
            preview.redactions.map((r) => (
              <li key={r.kind}>
                Redacting {r.count} × {r.kind.replace("_", " ")}
                {r.samples[0] && <span className="font-mono text-foreground-subtle"> · e.g. {r.samples[0].sample}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </ConfirmDialog>
  );
}
