import { useEffect, useState } from "react";

/** Hash routes: #/runs/:traceId, #/checks, #/settings/:tab. */
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
  window.location.hash = `#/${path.replace(/^[#/]+/, "")}`;
}
