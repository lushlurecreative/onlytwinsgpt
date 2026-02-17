import { NextResponse } from "next/server";
import { requireWorkerSecret } from "@/lib/worker-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Params = { params: Promise<{ subjectId: string }> };

/**
 * GET: Worker fetches subject consent_status. Refuse training/generation unless approved.
 * Protected by WORKER_SECRET.
 */
export async function GET(_request: Request, { params }: Params) {
  if (!requireWorkerSecret(_request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { subjectId } = await params;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("subjects")
    .select("id, consent_status")
    .eq("id", subjectId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Subject not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: data.id,
    consent_status: data.consent_status,
    allowed: data.consent_status === "approved",
  });
}
