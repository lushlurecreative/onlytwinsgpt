import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { runMigrations } from "@/lib/run-migrations";

type LeadInput = {
  source: string;
  handle: string;
  platform: string;
  followerCount?: number;
  engagementRate?: number;
  luxuryTagHits?: number;
  profileUrl?: string;
  notes?: string;
};

function scoreLead(input: {
  followerCount: number;
  engagementRate: number;
  luxuryTagHits: number;
}) {
  const followerScore = Math.min(50, Math.floor(input.followerCount / 5000));
  const engagementScore = Math.min(30, Math.floor(input.engagementRate * 4));
  const luxuryScore = Math.min(20, input.luxuryTagHits * 2);
  return followerScore + engagementScore + luxuryScore;
}

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

  const admin = getSupabaseAdmin();
  const fullSelect =
    "id, source, handle, platform, follower_count, engagement_rate, luxury_tag_hits, score, status, profile_url, profile_urls, platforms_found, content_verticals, notes, sample_preview_path, sample_paths, generated_sample_paths, approved_at, messaged_at, created_at";
  const baseSelect =
    "id, source, handle, platform, follower_count, engagement_rate, luxury_tag_hits, score, status, profile_url, notes, sample_preview_path, approved_at, messaged_at, created_at";
  const minSelect = "id, source, handle, platform, follower_count, score, status, profile_url, created_at";

  let result = await admin.from("leads").select(fullSelect).order("score", { ascending: false }).limit(1000);
  const errMsg = result.error?.message ?? "";

  if (result.error) {
    await runMigrations();
    result = await admin.from("leads").select(fullSelect).order("score", { ascending: false }).limit(1000);
  }
  if (result.error) {
    result = await admin.from("leads").select(baseSelect).order("score", { ascending: false }).limit(1000);
  }
  if (result.error) {
    result = await admin.from("leads").select(minSelect).order("score", { ascending: false }).limit(1000);
  }

  if (result.error) {
    return NextResponse.json(
      { leads: [] as unknown[], error: result.error.message },
      { status: 200 }
    );
  }
  return NextResponse.json({ leads: (result.data ?? []) as unknown[] }, { status: 200 });
}

export async function POST(request: Request) {
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

  let body: { leads?: LeadInput[] } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const leads = body.leads ?? [];
  if (leads.length === 0) {
    return NextResponse.json({ error: "leads[] is required" }, { status: 400 });
  }

  const rows = leads.map((lead) => {
    const followerCount = Math.max(0, Number(lead.followerCount ?? 0));
    const engagementRate = Math.max(0, Number(lead.engagementRate ?? 0));
    const luxuryTagHits = Math.max(0, Number(lead.luxuryTagHits ?? 0));
    return {
      source: lead.source.trim(),
      handle: lead.handle.trim(),
      platform: lead.platform.trim(),
      follower_count: followerCount,
      engagement_rate: engagementRate,
      luxury_tag_hits: luxuryTagHits,
      score: scoreLead({ followerCount, engagementRate, luxuryTagHits }),
      profile_url: lead.profileUrl?.trim() || null,
      notes: lead.notes?.trim() || null,
    };
  });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("leads").insert(rows).select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ imported: data?.length ?? 0 }, { status: 201 });
}

