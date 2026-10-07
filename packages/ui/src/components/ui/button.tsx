import type { ButtonHTMLAttributes } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../lib/cn";
import { Spinner } from "./spinner";

export const buttonVariants = tv({
  base: "focus-ring inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-body-medium transition-colors motion-fast disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  variants: {
    variant: {
      // The one primary action per view: the Neatlogs dark CTA pill.
      default: "rounded-full bg-[image:var(--btn-cta-gradient)] text-white shadow-[var(--btn-cta-ring)] hover:brightness-110",
      secondary: "bg-secondary text-secondary-foreground hover:bg-surface-strong",
      outline: "border border-border bg-card text-foreground shadow-[var(--elevation-button)] hover:bg-surface-subtle",
      ghost: "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
      destructive: "bg-destructive text-white hover:opacity-90",
      link: "text-foreground underline-offset-4 hover:underline px-0",
    },
    size: {
      sm: "h-7 px-2.5 text-label",
      default: "h-8 px-3",
      icon: "size-8 p-0",
      "icon-sm": "size-7 p-0",
    },
  },
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
