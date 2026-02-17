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
      .select("id, status, output_path, lead_id")
      .eq("runpod_job_id", runpodId)
      .maybeSingle();
    if (gen?.id) {
      const out = body.output && typeof body.output === "object" ? (body.output as { output_path?: string }) : null;
      const outputPath = out?.output_path ?? (gen.output_path as string | null) ?? null;
      if (outputPath && gen.status !== "completed") {
        await admin
          .from("generation_jobs")
          .update({ status: "completed", output_path: outputPath })
          .eq("id", gen.id);
      }
      const leadId = (gen as { lead_id?: string | null }).lead_id;
      if (leadId && outputPath) {
        await admin
          .from("leads")
          .update({
            sample_asset_path: outputPath,
            status: "sample_done",
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);
        await admin.from("automation_events").insert({
          event_type: "sample_done",
          entity_type: "lead",
          entity_id: leadId,
          payload_json: { generation_job_id: gen.id, output_path: outputPath },
        });
      }
      if (gen.status !== "completed" || leadId) {
        return NextResponse.json({ ok: true, updated: "generation_job" });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
