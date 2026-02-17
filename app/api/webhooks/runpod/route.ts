import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * RunPod Serverless webhook: RunPod POSTs here when a job completes/fails.
 * Payload: same as /status (id, status, output?, error?). We look up our job by runpod_job_id.
 */
export async function POST(request: Request) {
  let body: { id?: string; status?: string; output?: unknown; error?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const runpodId = body.id;
  const status = body.status;
  if (!runpodId || !status) {
    return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  if (status === "FAILED" || status === "TIMED_OUT" || status === "CANCELLED") {
    const errMsg = body.error || status;
    const { data: training } = await admin
      .from("training_jobs")
      .update({ status: "failed", logs: `RunPod: ${errMsg}` })
      .eq("runpod_job_id", runpodId)
      .select("id")
      .maybeSingle();
    if (training?.id) {
      return NextResponse.json({ ok: true, updated: "training_job" });
    }
    await admin
      .from("generation_jobs")
      .update({ status: "failed" })
      .eq("runpod_job_id", runpodId);
    return NextResponse.json({ ok: true, updated: "generation_job" });
  }

  if (status === "COMPLETED") {
    const { data: training } = await admin
      .from("training_jobs")
      .select("id, status")
      .eq("runpod_job_id", runpodId)
      .maybeSingle();
    if (training?.id && training.status !== "completed") {
      await admin
        .from("training_jobs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          logs: "Completed via RunPod webhook",
        })
        .eq("id", training.id);
      return NextResponse.json({ ok: true, updated: "training_job" });
    }
    const { data: gen } = await admin
      .from("generation_jobs")
      .select("id, status, output_path")
      .eq("runpod_job_id", runpodId)
      .maybeSingle();
    if (gen?.id && gen.status !== "completed" && body.output && typeof body.output === "object") {
      const out = body.output as { output_path?: string };
      if (out.output_path) {
        await admin
          .from("generation_jobs")
          .update({ status: "completed", output_path: out.output_path })
          .eq("id", gen.id);
      }
      return NextResponse.json({ ok: true, updated: "generation_job" });
    }
  }

  return NextResponse.json({ ok: true });
}
