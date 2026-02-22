import { NextResponse } from "next/server";
import { requireWorkerSecret } from "@/lib/worker-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { GenerationJobStatus } from "@/lib/db-enums";

type Params = { params: Promise<{ jobId: string }> };

/**
 * PATCH: Worker updates generation_job status and output_path.
 * Protected by WORKER_SECRET.
 */
export async function PATCH(request: Request, { params }: Params) {
  if (!requireWorkerSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  let body: { status?: GenerationJobStatus; output_path?: string; logs?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const updates: Record<string, unknown> = {};
  if (body.status) updates.status = body.status;
  if (body.output_path !== undefined) updates.output_path = body.output_path;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("generation_jobs")
    .update(updates)
    .eq("id", jobId)
    .select("id, status, output_path")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ job: data });
}
