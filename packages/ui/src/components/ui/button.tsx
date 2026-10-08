import type { ButtonHTMLAttributes } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../lib/cn";
import { Spinner } from "./spinner";

/** Variants and sizes follow the Neatlogs app's Button. */
export const buttonVariants = tv({
  base: "focus-ring inline-flex cursor-pointer select-none items-center justify-center gap-1.5 overflow-hidden rounded-md text-body-medium whitespace-nowrap transition-colors motion-fast disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  variants: {
    variant: {
      /** The one main action per view: the dark CTA. */
      default:
        "border border-transparent bg-[image:var(--btn-cta-gradient)] [background-clip:padding-box,border-box] bg-origin-border text-inverse-surface-foreground shadow-[var(--btn-cta-ring),var(--elevation-button)] hover:opacity-90 dark:border-border dark:bg-inverse-surface dark:bg-none dark:shadow-[var(--elevation-button)]",
      /** Hairline border and a layered shadow; a supporting action. */
      secondary:
        "border border-border/70 bg-background text-xs text-foreground shadow-[var(--elevation-button)] hover:bg-surface-subtle active:bg-surface-strong dark:border-border dark:bg-muted dark:hover:bg-muted/80",
      outline: "border border-border bg-background text-foreground hover:bg-surface-subtle active:bg-surface-strong",
      ghost: "text-foreground hover:bg-surface-subtle active:bg-surface-strong dark:hover:bg-muted",
      muted: "text-muted-foreground hover:bg-surface-subtle hover:text-foreground active:bg-surface-strong dark:hover:bg-muted",
      destructive: "bg-destructive text-white hover:opacity-90",
      link: "px-0 text-info-fg underline-offset-4 hover:underline",
    },
    size: {
      default: "h-8 px-2.5",
      sm: "h-7 px-2 text-xs",
      icon: "size-8 p-0",
      "icon-sm": "size-7 p-0",
    },
  },
  compoundVariants: [{ variant: "secondary", size: "default", className: "px-3" }],
  defaultVariants: { variant: "default", size: "default" },
});

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { pending?: boolean; pendingLabel?: string };

/** A button. While pending it keeps its label (or shows pendingLabel) beside a spinner. */
export function Button({ className, variant, size, pending, pendingLabel, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || pending} aria-busy={pending || undefined} {...rest}>
      {pending && <Spinner size="xs" label="" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
