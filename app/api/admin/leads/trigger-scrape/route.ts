import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type ScrapeCriteria = {
  followerRange?: Record<string, { min?: number; max?: number }>;
  platforms?: string[];
  activityMode?: "active" | "inactive";
  inactivityWeeks?: number;
  bioKeywords?: string[];
  usernamePatterns?: string[];
  contentTags?: string[];
  engagementMin?: number;
  visualSignals?: string[];
  requireVisualMatch?: boolean;
};

/**
 * Admin creates a scrape trigger with optional criteria. Scraper polls pending-scrape and runs when it sees one.
 */
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

  let criteria: ScrapeCriteria | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body.criteria === "object" && body.criteria !== null) {
      criteria = body.criteria as ScrapeCriteria;
    }
  } catch {
    // no body or invalid JSON - use defaults
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("scrape_triggers")
    .insert({ criteria: criteria ?? {} })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, triggerId: data.id, criteria: criteria ?? {} }, { status: 201 });
}
