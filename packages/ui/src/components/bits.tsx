import { useEffect, useState, type ReactNode } from "react";
import { pct } from "../format";

export function BoltIcon({ size = 16, color = "var(--signal)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 1.5 4 13.5h6.2L8.6 22.5 20 9.8h-6.3z" fill={color} />
    </svg>
  );
}

export function StatusGlyph({ status }: { status: string }) {
  return <span className={`status-glyph ${status}`} title={status} />;
}

export function Pill({ kind, children }: { kind?: string; children: ReactNode }) {
  return <span className={`pill ${kind ?? ""}`}>{children}</span>;
}

export function Meter({ value, tone }: { value: number | null; tone?: "ok" }) {
  if (value === null) {
    return (
      <span className="meter" title="Rules run in code and have no probability">
        <span className="pill">rule</span>
      </span>
    );
  }
  return (
    <span className={`meter ${tone ?? ""}`} title={`probability ${pct(value)}`}>
      <span className="bar">
        <i style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      {pct(value)}
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn small ghost copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

/** Hash routes: #/runs/:id, #/checks, #/settings, #/push/:id */
export function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export function go(path: string): void {
  window.location.hash = path.startsWith("#") ? path : `#/${path.replace(/^\//, "")}`;
}

let toastSetter: ((m: string | null) => void) | null = null;

export function toast(message: string): void {
  toastSetter?.(message);
}

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSetter = (m) => {
      setMsg(m);
      if (m) setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 3500);
    };
    return () => {
      toastSetter = null;
    };
  }, []);
  return msg ? <div className="toast">{msg}</div> : null;
}
