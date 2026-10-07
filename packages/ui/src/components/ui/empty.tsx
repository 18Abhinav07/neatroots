import type { IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./icon";

/** The Empty family: the one sanctioned centered surface for zero/empty states. */
export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col items-center justify-center gap-6 px-6 py-16 text-center", className)}>{children}</div>;
}

export function EmptyMedia({ icon }: { icon: IconSvgElement }) {
  return (
    <div className="relative">
      <div aria-hidden className="absolute inset-0 translate-x-1.5 -translate-y-1.5 rotate-6 rounded-lg border border-border bg-surface-subtle" />
      <div className="relative flex size-12 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground elevation-card">
        <Icon icon={icon} size="md" />
      </div>
    </div>
  );
}

export function EmptyHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="flex max-w-md flex-col gap-1.5">
      <h2 className="text-title text-foreground">{title}</h2>
      {description && <div className="text-body text-muted-foreground">{description}</div>}
    </div>
  );
}

export function EmptyContent({ children }: { children: ReactNode }) {
  return <div className="flex w-full max-w-md flex-col items-center gap-2">{children}</div>;
}
