/**
 * One-off script to ensure the model_artifacts bucket exists in Supabase.
 * Usage: WORKER_SECRET=xxx APP_URL=http://localhost:3000 npx tsx scripts/ensure-model-artifacts-bucket.ts
 * Or call POST /api/internal/setup/storage with Authorization: Bearer {WORKER_SECRET} after deploy.
 */

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const WORKER_SECRET = process.env.WORKER_SECRET;

async function main() {
  if (!WORKER_SECRET) {
    console.error("Set WORKER_SECRET");
    process.exit(1);
  }
  const res = await fetch(`${APP_URL.replace(/\/$/, "")}/api/internal/setup/storage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WORKER_SECRET}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Error:", json.error ?? res.statusText);
    process.exit(1);
  }
  console.log("Bucket:", json.bucket, json.created ? "(created)" : "(already existed)");
}

main();
