import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const control =
  "w-full rounded-md border border-input bg-card px-2.5 text-body text-foreground placeholder:text-foreground-subtle transition-colors motion-fast focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:opacity-50";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-8", className)} {...rest} />;
}

export function Textarea({ className, mono, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return <textarea className={cn(control, "py-2 leading-5", mono && "font-mono text-xs", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, "h-8 cursor-pointer pr-7", className)} {...rest}>
      {children}
    </select>
  );
}

/** A labeled form field. */
export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-label text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <div className="text-caption text-foreground-subtle">{hint}</div>}
    </div>
  );
}

/** Label + value pair: type and space carry the hierarchy, no box. */
export function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-label text-muted-foreground">{label}</span>
      <span className="min-w-0 text-body text-foreground">{children}</span>
    </div>
  );
}
