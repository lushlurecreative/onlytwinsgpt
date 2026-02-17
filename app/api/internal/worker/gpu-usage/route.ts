import { NextResponse } from "next/server";
import { requireWorkerSecret } from "@/lib/worker-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Body = {
  job_type: "training" | "generation" | "lead_sample";
  job_id: string;
  runpod_job_id?: string | null;
  duration_sec: number;
  cost_usd?: number | null;
};

/**
 * POST: Worker reports GPU usage for a completed job. Used for cost tracking and lead_sample budget.
 */
export async function POST(request: Request) {
  if (!requireWorkerSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !body.job_type ||
    !["training", "generation", "lead_sample"].includes(body.job_type) ||
    !body.job_id ||
    typeof body.duration_sec !== "number"
  ) {
    return NextResponse.json(
      { error: "job_type (training|generation|lead_sample), job_id, and duration_sec required" },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("gpu_usage").insert({
    job_type: body.job_type,
    job_id: body.job_id,
    runpod_job_id: body.runpod_job_id ?? null,
    duration_sec: body.duration_sec,
    cost_usd: body.cost_usd ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
