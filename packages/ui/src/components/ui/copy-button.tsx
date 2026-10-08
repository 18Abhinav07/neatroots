import { CheckmarkCircle02Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Icon } from "./icon";
import { cn } from "../../lib/cn";

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={done ? "Copied" : label}
      title={done ? "Copied" : label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className={cn(
        "focus-ring inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-surface-strong hover:text-foreground",
        className,
      )}
    >
      <Icon icon={done ? CheckmarkCircle02Icon : Copy01Icon} size="xxs" className={done ? "text-success-fg" : undefined} />
    </button>
  );
}

/** A command or snippet the user copies: recessed well, mono. */
export function CodeLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 py-1 font-mono text-xs break-all whitespace-pre-wrap text-foreground">{text}</code>
      <CopyButton text={text} />
    </div>
  );
}
