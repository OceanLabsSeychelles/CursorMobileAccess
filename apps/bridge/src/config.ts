import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BRIDGE_ENV_KEYS = new Set([
  "BRIDGE_AUTH_TOKEN",
  "BRIDGE_HOST",
  "BRIDGE_PORT",
  "CDP_URL",
  "NTFY_URL",
  "NTFY_TOPIC",
  "BRIDGE_PUBLIC_URL",
  "WEB_ROOT",
]);

/** Load repo .env and apply known bridge keys (overrides stale shell env). */
function loadRepoEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  let text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!BRIDGE_ENV_KEYS.has(key)) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadRepoEnv(path.resolve(__dirname, "../../../.env"));
loadRepoEnv(path.resolve(process.cwd(), ".env"));

export interface BridgeConfig {
  cdpHttpUrl: string;
  bindHost: string;
  bindPort: number;
  authToken: string;
  webRoot: string;
  /** Base URL of ntfy server, e.g. http://127.0.0.1:2586 */
  ntfyUrl?: string;
  /** Topic name (keep private on shared servers) */
  ntfyTopic?: string;
  /** URL opened when tapping an ntfy notification (phone-reachable web UI) */
  publicUrl?: string;
}

export function loadConfig(): BridgeConfig {
  const token = process.env.BRIDGE_AUTH_TOKEN ?? "dev-change-me";
  const defaultWeb = path.resolve(__dirname, "../../web/dist");
  const ntfyUrl = process.env.NTFY_URL?.trim() || undefined;
  const ntfyTopic = process.env.NTFY_TOPIC?.trim() || undefined;
  const bindHost = process.env.BRIDGE_HOST ?? "127.0.0.1";
  const bindPort = Number(process.env.BRIDGE_PORT ?? "8787");
  const publicUrl =
    process.env.BRIDGE_PUBLIC_URL?.trim() ||
    (bindHost !== "127.0.0.1" && bindHost !== "localhost"
      ? `http://${bindHost}:${bindPort}`
      : undefined);
  return {
    cdpHttpUrl: process.env.CDP_URL ?? "http://127.0.0.1:9222",
    bindHost,
    bindPort,
    authToken: token,
    webRoot: path.resolve(process.env.WEB_ROOT ?? defaultWeb),
    ntfyUrl,
    ntfyTopic,
    publicUrl,
  };
}
