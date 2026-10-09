const DEBUG = !!process.env.NEATBOLT_DEBUG;
let quiet = false;

export function setQuiet(q: boolean): void {
  quiet = q;
}

export const log = {
  info: (...a: unknown[]) => {
    if (!quiet) console.error("[neatbolt]", ...a);
  },
  warn: (...a: unknown[]) => {
    if (!quiet) console.error("[neatbolt] warn:", ...a);
  },
  error: (...a: unknown[]) => console.error("[neatbolt] error:", ...a),
  debug: (...a: unknown[]) => {
    if (DEBUG) console.error("[neatbolt] debug:", ...a);
  },
};
