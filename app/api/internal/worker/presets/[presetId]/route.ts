import { NextResponse } from "next/server";
import { requireWorkerSecret } from "@/lib/worker-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Params = { params: Promise<{ presetId: string }> };

/**
 * GET: Worker fetches preset prompt/negative_prompt/parameter_json for a generation_job.
 * Protected by WORKER_SECRET.
 */
export async function GET(_request: Request, { params }: Params) {
  if (!requireWorkerSecret(_request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { presetId } = await params;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("presets")
    .select("id, name, prompt, negative_prompt, parameter_json")
    .eq("id", presetId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Preset not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
