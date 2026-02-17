import { NextResponse } from "next/server";
import { requireWorkerSecret } from "@/lib/worker-auth";
import { logWatermark } from "@/lib/watermark";

/**
 * POST: Worker reports a watermark embed (after embedding in image). Inserts into watermark_logs.
 */
export async function POST(request: Request) {
  if (!requireWorkerSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    asset_type: "lead_sample" | "paid_output";
    lead_id?: string | null;
    user_id?: string | null;
    generation_job_id?: string | null;
    asset_path: string;
    watermark_hash: string;
    algorithm_version?: string;
    signature_version?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.asset_type || !body.asset_path || !body.watermark_hash) {
    return NextResponse.json({ error: "Missing asset_type, asset_path, or watermark_hash" }, { status: 400 });
  }
  const ok = await logWatermark({
    asset_type: body.asset_type,
    lead_id: body.lead_id ?? null,
    user_id: body.user_id ?? null,
    generation_job_id: body.generation_job_id ?? null,
    asset_path: body.asset_path,
    watermark_hash: body.watermark_hash,
    algorithm_version: body.algorithm_version,
    signature_version: body.signature_version,
  });
  if (!ok) return NextResponse.json({ error: "Failed to log" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
