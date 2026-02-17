import { NextResponse } from "next/server";
import { requireWorkerSecret } from "@/lib/worker-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const MODEL_ARTIFACTS_BUCKET = "model_artifacts";

/**
 * POST: Ensure model_artifacts bucket exists (private). Idempotent.
 * Protected by WORKER_SECRET. Call once after deploy or from a setup script.
 */
export async function POST(request: Request) {
  if (!requireWorkerSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 400 });
  }
  const exists = (buckets ?? []).some((b) => b.name === MODEL_ARTIFACTS_BUCKET);
  if (exists) {
    return NextResponse.json({ ok: true, bucket: MODEL_ARTIFACTS_BUCKET, created: false });
  }

  const { error: createError } = await admin.storage.createBucket(MODEL_ARTIFACTS_BUCKET, {
    public: false,
  });
  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, bucket: MODEL_ARTIFACTS_BUCKET, created: true });
}
