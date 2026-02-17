import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { scrapeReddit, type ScrapeCriteria } from "@/lib/scrape-reddit";
import { ingestLeads, type IngestLeadInput } from "@/lib/ingest-leads";

export type { ScrapeCriteria };

/**
 * Admin clicks "Run scrape" - runs the scrape inline and inserts leads directly.
 * No webhook secret needed. No external API calls.
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

  let criteria: ScrapeCriteria = {};
  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body.criteria === "object" && body.criteria !== null) {
      criteria = body.criteria as ScrapeCriteria;
    }
  } catch {
    // no body or invalid JSON - use defaults
  }

  let leads = await scrapeReddit(criteria);
  if (leads.length === 0) {
    leads = [
      {
        handle: `demo_${Date.now().toString(36)}`,
        platform: "reddit",
        profileUrl: "https://reddit.com",
        platformsFound: ["reddit"],
        profileUrls: { reddit: "https://reddit.com" },
        followerCount: 0,
        engagementRate: 0,
        luxuryTagHits: 0,
      },
      {
        handle: `demo_${(Date.now() + 1).toString(36)}`,
        platform: "reddit",
        profileUrl: "https://reddit.com",
        platformsFound: ["reddit"],
        profileUrls: { reddit: "https://reddit.com" },
        followerCount: 0,
        engagementRate: 0,
        luxuryTagHits: 0,
      },
    ];
  }

  const inputs: IngestLeadInput[] = leads.map((l) => ({
    handle: l.handle,
    platform: l.platform,
    profileUrl: l.profileUrl,
    profileUrls: l.profileUrls,
    platformsFound: l.platformsFound,
    followerCount: l.followerCount,
    engagementRate: l.engagementRate,
    luxuryTagHits: l.luxuryTagHits,
  }));

  const { imported } = await ingestLeads(inputs, "reddit");

  if (imported === 0) {
    return NextResponse.json(
      {
        error: "Scrape found leads but none could be saved. Check database schema and RLS policies.",
      },
      { status: 500 }
    );
  }

  const isDemo = leads.every((l) => l.handle.startsWith("demo_"));
  return NextResponse.json(
    {
      ok: true,
      imported,
      message: isDemo
        ? `Reddit returned empty. Inserted ${imported} demo leads to verify pipeline. Delete when done testing.`
        : `Imported ${imported} leads.`,
    },
    { status: 201 }
  );
}
