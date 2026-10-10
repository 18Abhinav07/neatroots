import type { RootsConfig } from "../config.js";
import { LAYA_DOWNLOAD_MB } from "./laya.js";

// Laya is a download of about 1.4 GB, so neatroots asks before fetching it and says why it exists.
// The answer is kept in config (classifier.laya.consent); a Laya that is already installed keeps
// running whatever the answer.

export type LayaConsent = "yes" | "no";

/** Why neatroots wants Laya, and what to do instead. Shown by the installer, start and the CLI. */
export function layaPitch(dir: string): string[] {
  const gb = (LAYA_DOWNLOAD_MB / 1000).toFixed(1);
  return [
    `neatroots checks each run with yes/no questions, such as "did the agent carry on after a tool failed?"`,
    `Laya is an open 421M-parameter model that answers them on this machine: private, free, and quick once it`,
    `has learned your agent. It's a one-time download of about ${gb} GB (PyTorch and the model) into ${dir}.`,
    ``,
    `Rather not download it? Set up Jev cloud for these answers instead: neatroots jev login && neatroots jev on`,
    `(the span content a question needs is then sent to TypeSafe). Until Laya or Jev is set up, your LLM answers`,
    `them, more slowly.`,
  ];
}

/** What to do next, after each answer. */
export function layaNextSteps(consent: LayaConsent): string {
  return consent === "yes"
    ? "✓ Laya downloads in the background the first time neatroots starts (neatroots laya install does it now)."
    : "Skipped Laya. Set up Jev cloud for check answers: neatroots jev login && neatroots jev on. Change your mind any time: neatroots laya install, or Settings → Decision model.";
}

/** Whether neatroots should ask: Laya is on, not installed, and the person hasn't answered yet. */
export function shouldAskForLaya(cfg: RootsConfig, installed: boolean): boolean {
  return cfg.classifier.laya.enabled && !installed && !cfg.classifier.laya.consent;
}

/** Asks on the terminal (yes is the default) and returns the answer; the caller saves it. */
export async function askForLaya(dir: string, ask: (q: string) => Promise<string>): Promise<LayaConsent> {
  console.log(`\n${layaPitch(dir).join("\n")}\n`);
  const a = (await ask("Download Laya? [Y/n] ")).trim().toLowerCase();
  return a === "" || a === "y" || a === "yes" ? "yes" : "no";
}
