import { NextResponse } from "next/server";
import { requireWorkerSecret } from "@/lib/worker-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Params = { params: Promise<{ jobId: string }> };

/**
 * PATCH: Worker updates training_job status, logs, started_at, finished_at.
 * Protected by WORKER_SECRET.
 */
export async function PATCH(request: Request, { params }: Params) {
  if (!requireWorkerSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  let body: {
    status?: string;
    logs?: string;
    started_at?: string;
    finished_at?: string;
    lora_model_reference?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const updates: Record<string, unknown> = {};
  if (body.status) updates.status = body.status;
  if (body.logs !== undefined) updates.logs = body.logs;
  if (body.started_at) updates.started_at = body.started_at;
  if (body.finished_at) updates.finished_at = body.finished_at;
  if (Object.keys(updates).length === 0 && !body.lora_model_reference) {
    return NextResponse.json({ error: "No updates" }, { status: 400 });
  }

  if (Object.keys(updates).length > 0) {
    const { data, error } = await admin
      .from("training_jobs")
      .update(updates)
      .eq("id", jobId)
      .select("id, status, subject_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // When marking completed with lora_model_reference, update subjects_models for this subject
    if (
      body.status === "completed" &&
      body.lora_model_reference &&
      (data as { subject_id?: string }).subject_id
    ) {
      await admin
        .from("subjects_models")
        .update({
          lora_model_reference: body.lora_model_reference,
          training_status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("subject_id", (data as { subject_id: string }).subject_id);
    }
    return NextResponse.json({ job: data });
  }

  // Only lora_model_reference update: need subject_id from job
  const { data: job } = await admin
    .from("training_jobs")
    .select("subject_id")
    .eq("id", jobId)
    .single();

  if (!job?.subject_id) {
    return NextResponse.json({ error: "Job not found or no subject_id" }, { status: 400 });
  }
  const { error: modelError } = await admin
    .from("subjects_models")
    .update({
      lora_model_reference: body.lora_model_reference,
      training_status: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("subject_id", job.subject_id);
  if (modelError) {
    return NextResponse.json({ error: modelError.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
