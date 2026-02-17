import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** GET: List recent training_jobs and generation_jobs. Admin only. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
  const admin = getSupabaseAdmin();

  const [trainingRes, generationRes] = await Promise.all([
    admin
      .from("training_jobs")
      .select("id, subject_id, status, runpod_job_id, created_at, started_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("generation_jobs")
      .select("id, subject_id, preset_id, status, output_path, runpod_job_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  return NextResponse.json({
    training_jobs: trainingRes.data ?? [],
    generation_jobs: generationRes.data ?? [],
  });
}
