const DEBUG = !!process.env.BOLTS_DEBUG;
let quiet = false;

export function setQuiet(q: boolean): void {
  quiet = q;
}

export const log = {
  info: (...a: unknown[]) => {
    if (!quiet) console.error("[bolts]", ...a);
  },
  warn: (...a: unknown[]) => {
    if (!quiet) console.error("[bolts] warn:", ...a);
  },
  error: (...a: unknown[]) => console.error("[bolts] error:", ...a),
  debug: (...a: unknown[]) => {
    if (DEBUG) console.error("[bolts] debug:", ...a);
  },
};
