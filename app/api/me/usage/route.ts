import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveUsageContext } from "@/lib/usage-limits";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const usageContext = await resolveUsageContext(admin, user.id);
  if (!usageContext) {
    return NextResponse.json(
      {
        error: "No active subscription usage context found.",
        code: "NO_USAGE_CONTEXT",
      },
      { status: 403 }
    );
  }

  const { data, error } = await admin
    .from("usage_ledger")
    .select("image_units, video_units")
    .eq("user_id", user.id)
    .eq("period_start", usageContext.periodStartIso)
    .eq("period_end", usageContext.periodEndIso);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const usedImages = (data ?? []).reduce(
    (sum, row) => sum + (Number((row as { image_units?: number }).image_units) || 0),
    0
  );
  const usedVideos = (data ?? []).reduce(
    (sum, row) => sum + (Number((row as { video_units?: number }).video_units) || 0),
    0
  );

  return NextResponse.json(
    {
      plan_key: usageContext.planKey,
      subscription_status: usageContext.subscriptionStatus,
      period_start: usageContext.periodStartIso,
      period_end: usageContext.periodEndIso,
      images: {
        used: usedImages,
        limit: usageContext.imageLimit,
        remaining: Math.max(0, usageContext.imageLimit - usedImages),
      },
      videos: {
        used: usedVideos,
        limit: usageContext.videoLimit,
        remaining: Math.max(0, usageContext.videoLimit - usedVideos),
      },
    },
    { status: 200 }
  );
}
