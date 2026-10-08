import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";

/**
 * Confirmation for consequential actions. The confirm label is always Verb + Noun
 * ("Send run to Cloud", "Delete check"), never "Confirm".
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-full max-w-md rounded-xl border border-border bg-popover p-0 text-foreground elevation-modal backdrop:bg-black/40">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-heading">{title}</h2>
          <div className="text-body text-muted-foreground">{description}</div>
        </div>
        {children}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "default"} pending={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
