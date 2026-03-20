/**
 * load-env.ts
 * Loads .env.local into process.env for local script runs.
 * Handles quoted values and strips literal \n / \r escape sequences.
 * Call at the top of any script that needs env vars locally.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export function loadEnvLocal() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = join(repoRoot, ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    val = val.replace(/^["']|["']$/g, "");
    // Strip literal \n \r sequences (seen in some env files)
    val = val.replace(/\\n/g, "").replace(/\\r/g, "").trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}
