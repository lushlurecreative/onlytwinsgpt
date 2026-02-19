import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getRunPodConfig } from "@/lib/runpod";

/**
 * GET: Returns which env/setup items are configured (no secret values). Admin only.
 * Used by the Leads page "Setup checklist" so you can see what to set in Vercel.
 */
export async function GET() {
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

  const runpodConfig = await getRunPodConfig();
  let runpodFromDb = false;
  if (!runpodConfig) {
    const admin = getSupabaseAdmin();
    const [k, e] = await Promise.all([
      admin.from("app_settings").select("value").eq("key", "runpod_api_key").maybeSingle(),
      admin.from("app_settings").select("value").eq("key", "runpod_endpoint_id").maybeSingle(),
    ]);
    runpodFromDb = !!(k.data?.value as string)?.trim() && !!(e.data?.value as string)?.trim();
  }

  return NextResponse.json({
    database: !!process.env.DATABASE_URL?.trim(),
    supabase: !!(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    runpod: !!runpodConfig || runpodFromDb,
    workerSecret: !!process.env.WORKER_SECRET?.trim(),
    appUrl: !!(process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()),
    scrape: {
      youtube: !!process.env.YOUTUBE_API_KEY?.trim(),
      reddit: !!process.env.APIFY_TOKEN?.trim(),
      instagram: !!process.env.APIFY_TOKEN?.trim(),
      apify: !!process.env.APIFY_TOKEN?.trim(),
    },
    optional: {
      replicate: !!process.env.REPLICATE_API_TOKEN?.trim(),
      faceFilter: process.env.FACE_FILTER_ENABLED === "true" && !!process.env.REPLICATE_API_TOKEN?.trim(),
    },
  });
}
