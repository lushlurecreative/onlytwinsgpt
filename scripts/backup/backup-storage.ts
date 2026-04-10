/**
 * backup-storage.ts — Mirror the Supabase `uploads` bucket to local disk.
 *
 * Incremental: if a local file already exists and is the same size as the
 * remote object, it is skipped. Good enough for a low-friction mirror that
 * runs on a cron.
 *
 * Writes to $BACKUP_ROOT/storage/uploads/<object path>, default
 *   $HOME/onlytwins-backups/storage/uploads/
 *
 * Uses the service role key, so it can see every object in the bucket.
 * Never commit the output directory — it contains user-uploaded training
 * photos.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, statSync, writeFileSync, chmodSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { loadEnvLocal } from "../load-env";

loadEnvLocal();

const BUCKET = "uploads";
const BACKUP_ROOT = process.env.BACKUP_ROOT || join(homedir(), "onlytwins-backups");
const OUT_DIR = join(BACKUP_ROOT, "storage", BUCKET);
const PAGE_SIZE = 1000;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[err] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

ensureDir(OUT_DIR);
try { chmodSync(BACKUP_ROOT, 0o700); } catch {}
try { chmodSync(join(BACKUP_ROOT, "storage"), 0o700); } catch {}

type Counters = {
  seen: number;
  downloaded: number;
  skipped: number;
  failed: number;
  bytes: number;
};

const counters: Counters = { seen: 0, downloaded: 0, skipped: 0, failed: 0, bytes: 0 };

async function walkPrefix(prefix: string) {
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      console.error(`[err] list ${prefix || "(root)"} : ${error.message}`);
      return;
    }
    if (!data || data.length === 0) return;

    for (const entry of data) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A "folder" entry has a null id in Supabase storage listings.
      const isFolder = entry.id === null;
      if (isFolder) {
        await walkPrefix(fullPath);
      } else {
        counters.seen += 1;
        await downloadIfChanged(fullPath, entry);
      }
    }

    if (data.length < PAGE_SIZE) return;
    offset += PAGE_SIZE;
  }
}

async function downloadIfChanged(
  objectPath: string,
  entry: { name: string; metadata?: { size?: number } | null }
) {
  const localPath = join(OUT_DIR, objectPath);
  const remoteSize = entry.metadata?.size ?? null;

  if (remoteSize !== null && existsSync(localPath)) {
    try {
      const localSize = statSync(localPath).size;
      if (localSize === remoteSize) {
        counters.skipped += 1;
        return;
      }
    } catch {
      // fall through to re-download
    }
  }

  const { data, error } = await admin.storage.from(BUCKET).download(objectPath);
  if (error || !data) {
    counters.failed += 1;
    console.error(`[err] download ${objectPath}: ${error?.message || "no data"}`);
    return;
  }
  const buf = Buffer.from(await data.arrayBuffer());
  ensureDir(dirname(localPath));
  writeFileSync(localPath, buf);
  counters.downloaded += 1;
  counters.bytes += buf.length;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

(async () => {
  const start = Date.now();
  console.log(`[backup] mirroring ${BUCKET} → ${OUT_DIR}`);
  await walkPrefix("");
  const secs = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[ ok ] seen=${counters.seen} downloaded=${counters.downloaded} ` +
      `skipped=${counters.skipped} failed=${counters.failed} ` +
      `size=${formatBytes(counters.bytes)} elapsed=${secs}s`
  );
  if (counters.failed > 0) process.exit(2);
})().catch((e) => {
  console.error("[err]", e);
  process.exit(1);
});
