import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { boltsHome } from "../config.js";

const run = promisify(execFile);
const SERVICE = "neatlogs-bolts";
const ACCOUNT = "cloud-api-key";

function fallbackFile(): string {
  return path.join(boltsHome(), "cloud-api-key");
}

/**
 * Stores the user's Neatlogs Cloud API key. On macOS it lives in the login Keychain;
 * elsewhere in a 0600 file under ~/.bolts. The key never enters the database or logs.
 */
export async function getCloudKey(): Promise<string | undefined> {
  if (process.env.NEATLOGS_CLOUD_API_KEY) return process.env.NEATLOGS_CLOUD_API_KEY;
  if (process.platform === "darwin") {
    try {
      const { stdout } = await run("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"]);
      const key = stdout.trim();
      if (key) return key;
    } catch {
      /* not stored */
    }
  }
  try {
    return fs.readFileSync(fallbackFile(), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function setCloudKey(key: string): Promise<"keychain" | "file"> {
  if (process.platform === "darwin") {
    try {
      await run("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-w", key]);
      return "keychain";
    } catch {
      /* fall through to the file */
    }
  }
  fs.mkdirSync(boltsHome(), { recursive: true });
  fs.writeFileSync(fallbackFile(), key, { encoding: "utf8", mode: 0o600 });
  return "file";
}

export async function deleteCloudKey(): Promise<void> {
  if (process.platform === "darwin") {
    try {
      await run("security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT]);
    } catch {
      /* nothing stored */
    }
  }
  try {
    fs.unlinkSync(fallbackFile());
  } catch {
    /* nothing stored */
  }
}
