import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "../../lib/cn";

const SIZES = { xxs: 14, xs: 12, sm: 16, md: 20, lg: 24, xl: 32 } as const;

export type IconSize = keyof typeof SIZES;

/** The only way to render a standalone icon: Hugeicons at a scale size. */
export function Icon({ icon, size = "sm", className, label }: { icon: IconSvgElement; size?: IconSize; className?: string; label?: string }) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={SIZES[size]}
      strokeWidth={1.6}
      className={cn("shrink-0", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
