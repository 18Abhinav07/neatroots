import type { ReactNode } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import { cn } from "../../lib/cn";
import { Icon } from "./icon";

/** A page's title row, as on the Neatlogs list pages: icon, title, actions on the right. */
export function PageHeader({ icon, title, actions, className }: { icon?: IconSvgElement; title: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-12 items-center justify-between gap-4 px-6 pt-3 pb-3", className)}>
      <h1 className="flex min-w-0 items-center gap-2 text-base text-foreground">
        {icon && <Icon icon={icon} size="sm" className="shrink-0" />}
        <span className="truncate">{title}</span>
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
