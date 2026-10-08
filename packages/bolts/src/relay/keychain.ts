import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { boltsHome } from "../config.js";

const run = promisify(execFile);
const SERVICE = "neatlogs-bolts";

export type SecretName = "cloud-api-key" | "jev-api-key";

const ENV: Record<SecretName, string> = { "cloud-api-key": "NEATLOGS_CLOUD_API_KEY", "jev-api-key": "TYPESAFE_API_KEY" };

function fallbackFile(name: SecretName): string {
  return path.join(boltsHome(), name);
}

/**
 * Secrets live in the macOS login Keychain (service "neatlogs-bolts"); elsewhere in a 0600
 * file under ~/.bolts. They never enter the database or logs.
 */
export async function getSecret(name: SecretName): Promise<string | undefined> {
  const env = process.env[ENV[name]];
  if (env) return env;
  if (process.platform === "darwin") {
    try {
      const { stdout } = await run("security", ["find-generic-password", "-s", SERVICE, "-a", name, "-w"]);
      const key = stdout.trim();
      if (key) return key;
    } catch {
      /* not stored */
    }
  }
  try {
    return fs.readFileSync(fallbackFile(name), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function setSecret(name: SecretName, value: string): Promise<"keychain" | "file"> {
  if (process.platform === "darwin") {
    try {
      await run("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", name, "-w", value]);
      return "keychain";
    } catch {
      /* fall through to the file */
    }
  }
  fs.mkdirSync(boltsHome(), { recursive: true });
  fs.writeFileSync(fallbackFile(name), value, { encoding: "utf8", mode: 0o600 });
  return "file";
}

export async function deleteSecret(name: SecretName): Promise<void> {
  if (process.platform === "darwin") {
    try {
      await run("security", ["delete-generic-password", "-s", SERVICE, "-a", name]);
    } catch {
      /* nothing stored */
    }
  }
  try {
    fs.unlinkSync(fallbackFile(name));
  } catch {
    /* nothing stored */
  }
}

export const getCloudKey = () => getSecret("cloud-api-key");
export const setCloudKey = (key: string) => setSecret("cloud-api-key", key);
export const deleteCloudKey = () => deleteSecret("cloud-api-key");
