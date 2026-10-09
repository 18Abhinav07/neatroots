export function ago(ms: number | null | undefined): string {
  if (!ms) return "—";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dur(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  const m = Math.floor(ms / 60_000);
  return `${m} m ${Math.round((ms % 60_000) / 1000)} s`;
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

export function pct(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${Math.round(p * 100)}%`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** Keeps the start and end of an id so similar ids stay distinguishable. */
export function midId(id: string, keep = 6): string {
  return id.length <= keep * 2 + 1 ? id : `${id.slice(0, keep)}…${id.slice(-4)}`;
}

export function pretty(v: unknown): string {
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

/** A table timestamp, as in the Neatlogs app: "09:21 PM" and "Jul 17". */
export function stamp(ms: number | null | undefined): { time: string; date: string } {
  if (!ms) return { time: "—", date: "" };
  const d = new Date(ms);
  return {
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    date: d.toLocaleDateString(undefined, { month: "short", day: "2-digit" }),
  };
}
