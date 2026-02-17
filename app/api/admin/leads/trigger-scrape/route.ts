import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { scrapeReddit, type ScrapeCriteria, type ScrapedLead } from "@/lib/scrape-reddit";
import { scrapeYouTube } from "@/lib/scrape-youtube";
import { scrapeOnlyFinder } from "@/lib/scrape-aggregators";
import { ingestLeads, type IngestLeadInput } from "@/lib/ingest-leads";

export type { ScrapeCriteria };

/**
 * Admin clicks "Run scrape" - runs scrapers inline (YouTube + Reddit + OnlyFinder) and inserts leads.
 * Requires YOUTUBE_API_KEY for YouTube. Reddit uses public JSON. OnlyFinder scrapes aggregator HTML.
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

  const [ytResult, redditResult, aggResult] = await Promise.all([
    scrapeYouTube(criteria, { withDiagnostics: true }),
    scrapeReddit(criteria, { withDiagnostics: true }),
    scrapeOnlyFinder(undefined, { withDiagnostics: true }),
  ]);

  const ytLeads = Array.isArray(ytResult) ? ytResult : ytResult.leads;
  const ytDiagnostics = Array.isArray(ytResult) ? [] : ytResult.diagnostics;
  const redditLeads = redditResult.leads;
  const redditDiagnostics = redditResult.diagnostics;
  const aggLeads = Array.isArray(aggResult) ? aggResult : aggResult.leads;
  const aggDiagnostics = Array.isArray(aggResult) ? [] : aggResult.diagnostics;

  const seen = new Set<string>();
  const allLeads: { lead: IngestLeadInput; source: "youtube" | "reddit" | "aggregator" }[] = [];

  for (const l of ytLeads) {
    const key = `${l.platform}:${l.handle.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      allLeads.push({ lead: mapToIngest(l), source: "youtube" });
    }
  }
  for (const l of redditLeads) {
    const key = `${l.platform}:${l.handle.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      allLeads.push({ lead: mapToIngest(l), source: "reddit" });
    }
  }
  for (const l of aggLeads) {
    const key = `${l.platform}:${l.handle.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      allLeads.push({ lead: mapToIngest(l), source: "aggregator" });
    }
  }

  function mapToIngest(l: ScrapedLead): IngestLeadInput {
    return {
      handle: l.handle,
      platform: l.platform,
      profileUrl: l.profileUrl,
      profileUrls: l.profileUrls,
      platformsFound: l.platformsFound,
      followerCount: l.followerCount,
      engagementRate: l.engagementRate,
      luxuryTagHits: l.luxuryTagHits,
    };
  }

  let importedYt = 0;
  let importedRd = 0;
  let importedAgg = 0;
  let firstError: string | undefined;

  if (allLeads.length > 0) {
    const ytInputs = allLeads.filter((x) => x.source === "youtube").map((x) => x.lead);
    const rdInputs = allLeads.filter((x) => x.source === "reddit").map((x) => x.lead);
    const aggInputs = allLeads.filter((x) => x.source === "aggregator").map((x) => x.lead);
    if (ytInputs.length > 0) {
      const r = await ingestLeads(ytInputs, "youtube");
      importedYt = r.imported;
      if (r.firstError && !firstError) firstError = r.firstError;
    }
    if (rdInputs.length > 0) {
      const r = await ingestLeads(rdInputs, "reddit");
      importedRd = r.imported;
      if (r.firstError && !firstError) firstError = r.firstError;
    }
    if (aggInputs.length > 0) {
      const r = await ingestLeads(aggInputs, "aggregator");
      importedAgg = r.imported;
      if (r.firstError && !firstError) firstError = r.firstError;
    }
  } else {
    const demoLeads: IngestLeadInput[] = [
      {
        handle: `demo_${Date.now().toString(36)}`,
        platform: "reddit",
        profileUrl: "https://reddit.com",
        profileUrls: { reddit: "https://reddit.com" },
        platformsFound: ["reddit"],
        followerCount: 0,
        engagementRate: 0,
        luxuryTagHits: 0,
      },
      {
        handle: `demo_${(Date.now() + 1).toString(36)}`,
        platform: "reddit",
        profileUrl: "https://reddit.com",
        profileUrls: { reddit: "https://reddit.com" },
        platformsFound: ["reddit"],
        followerCount: 0,
        engagementRate: 0,
        luxuryTagHits: 0,
      },
    ];
    const r = await ingestLeads(demoLeads, "reddit");
    importedRd = r.imported;
    firstError = r.firstError;
  }

  const imported = importedYt + importedRd + importedAgg;

  if (imported === 0) {
    return NextResponse.json(
      {
        error: firstError
          ? `Scrape found leads but none could be saved: ${firstError}`
          : "Scrape found leads but none could be saved. Ensure DATABASE_URL is set in Vercel.",
      },
      { status: 500 }
    );
  }

  const isDemo = importedYt === 0 && importedRd > 0 && allLeads.length === 0;
  const failedYt = ytDiagnostics.filter((d) => !d.ok);
  const failedRd = redditDiagnostics.filter((d) => !d.ok);
  const diagnosticHint = isDemo
    ? failedRd.length > 0
      ? ` Reddit: ${failedRd.map((d) => `${d.subreddit} (${d.error})`).join("; ")}.`
      : failedYt.length > 0
        ? ` YouTube: ${failedYt.map((d) => `${d.query} (${d.error})`).join("; ")}. Set YOUTUBE_API_KEY in Vercel.`
        : ""
    : "";

  const parts: string[] = [];
  if (importedYt > 0) parts.push(`${importedYt} from YouTube`);
  if (importedRd > 0) parts.push(`${importedRd} from Reddit`);
  if (importedAgg > 0) parts.push(`${importedAgg} from OnlyFinder`);
  const message = isDemo
    ? `All sources returned 0 leads. Inserted ${imported} demo leads to verify pipeline.${diagnosticHint}`
    : `Imported ${parts.join(", ")}.`;

  return NextResponse.json(
    {
      ok: true,
      imported,
      importedYt,
      importedRd,
      importedAgg,
      isDemo,
      diagnostics: { youtube: ytDiagnostics, reddit: redditDiagnostics, aggregator: aggDiagnostics },
      message,
    },
    { status: 201 }
  );
}
