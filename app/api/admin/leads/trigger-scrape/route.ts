import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { scrapeReddit, type ScrapeCriteria, type ScrapedLead } from "@/lib/scrape-reddit";
import { scrapeYouTube } from "@/lib/scrape-youtube";
import { scrapeInstagram } from "@/lib/scrape-instagram";
import { scrapeOnlyFinder, scrapeFanFox, scrapeJuicySearch } from "@/lib/scrape-aggregators";
import { ingestLeads, type IngestLeadInput } from "@/lib/ingest-leads";
import { validateLead, filterCreatorImages } from "@/lib/validate-lead";

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

  const [ytResult, redditResult, igResult, onlyfinderResult, fanfoxResult, juicyResult] = await Promise.all([
    scrapeYouTube(criteria, { withDiagnostics: true }),
    scrapeReddit(criteria, { withDiagnostics: true }),
    scrapeInstagram({ followerFloor: 100000, withDiagnostics: true }),
    scrapeOnlyFinder(undefined, { withDiagnostics: true }),
    scrapeFanFox(undefined, { withDiagnostics: true }),
    scrapeJuicySearch(undefined, { withDiagnostics: true }),
  ]);

  const ytLeads = Array.isArray(ytResult) ? ytResult : ytResult.leads;
  const ytDiagnostics = Array.isArray(ytResult) ? [] : ytResult.diagnostics;
  const redditLeads = redditResult.leads;
  const redditDiagnostics = redditResult.diagnostics;
  const igLeads = Array.isArray(igResult) ? igResult : igResult.leads;
  const igDiagnostics = Array.isArray(igResult) ? [] : igResult.diagnostics;

  const onlyfinderLeads = Array.isArray(onlyfinderResult) ? onlyfinderResult : onlyfinderResult.leads;
  const fanfoxLeads = Array.isArray(fanfoxResult) ? fanfoxResult : fanfoxResult.leads;
  const juicyLeads = Array.isArray(juicyResult) ? juicyResult : juicyResult.leads;

  const aggDiagnostics = [
    ...(Array.isArray(onlyfinderResult) ? [] : onlyfinderResult.diagnostics),
    ...(Array.isArray(fanfoxResult) ? [] : fanfoxResult.diagnostics),
    ...(Array.isArray(juicyResult) ? [] : juicyResult.diagnostics),
  ];

  const seen = new Set<string>();
  const allLeads: { lead: IngestLeadInput; source: "youtube" | "reddit" | "instagram" | "aggregator" }[] = [];

  for (const l of ytLeads) {
    const key = `${l.platform}:${l.handle.toLowerCase()}`;
    if (!seen.has(key)) {
      const lead = mapToIngest(l);
      if (!isValidLead(lead)) continue;
      seen.add(key);
      allLeads.push({ lead, source: "youtube" });
    }
  }
  for (const l of redditLeads) {
    const key = `${l.platform}:${l.handle.toLowerCase()}`;
    if (!seen.has(key)) {
      const lead = mapToIngest(l);
      if (!isValidLead(lead)) continue;
      seen.add(key);
      allLeads.push({ lead, source: "reddit" });
    }
  }
  for (const l of igLeads) {
    const key = `${l.platform}:${l.handle.toLowerCase()}`;
    if (!seen.has(key)) {
      const lead = mapToIngest(l);
      if (!isValidLead(lead)) continue;
      seen.add(key);
      allLeads.push({ lead, source: "instagram" });
    }
  }
  for (const l of [...onlyfinderLeads, ...fanfoxLeads, ...juicyLeads]) {
    const key = `${l.platform}:${l.handle.toLowerCase()}`;
    if (!seen.has(key)) {
      const lead = mapToIngest(l);
      if (!isValidLead(lead)) continue;
      seen.add(key);
      allLeads.push({ lead, source: "aggregator" });
    }
  }

  function mapToIngest(l: ScrapedLead): IngestLeadInput {
    const sampleUrls = l.sampleUrls?.length ? filterCreatorImages(l.sampleUrls) : undefined;
    return {
      handle: l.handle,
      platform: l.platform,
      profileUrl: l.profileUrl,
      profileUrls: l.profileUrls,
      platformsFound: l.platformsFound,
      followerCount: l.followerCount,
      engagementRate: l.engagementRate,
      luxuryTagHits: l.luxuryTagHits,
      sampleUrls: sampleUrls?.length ? sampleUrls : undefined,
    };
  }

  function isValidLead(lead: IngestLeadInput): boolean {
    return validateLead(lead);
  }

  let importedYt = 0;
  let importedRd = 0;
  let importedIg = 0;
  let importedAgg = 0;
  let firstError: string | undefined;

  if (allLeads.length > 0) {
    const ytInputs = allLeads.filter((x) => x.source === "youtube").map((x) => x.lead);
    const rdInputs = allLeads.filter((x) => x.source === "reddit").map((x) => x.lead);
    const igInputs = allLeads.filter((x) => x.source === "instagram").map((x) => x.lead);
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
    if (igInputs.length > 0) {
      const r = await ingestLeads(igInputs, "instagram");
      importedIg = r.imported;
      if (r.firstError && !firstError) firstError = r.firstError;
    }
    if (aggInputs.length > 0) {
      const r = await ingestLeads(aggInputs, "aggregator");
      importedAgg = r.imported;
      if (r.firstError && !firstError) firstError = r.firstError;
    }
  }

  const imported = importedYt + importedRd + importedIg + importedAgg;

  if (allLeads.length === 0) {
    const failedYt = ytDiagnostics.filter((d) => !d.ok);
    const failedRd = redditDiagnostics.filter((d) => !d.ok);
    const failedIg = igDiagnostics.filter((d) => !d.ok);
    const failedAgg = aggDiagnostics.filter((d) => !d.ok);
    const diagnosticParts: string[] = [];
    if (failedRd.length > 0)
      diagnosticParts.push(`Reddit: ${failedRd.map((d) => `${(d as { subreddit?: string }).subreddit ?? "?"} (${d.error})`).join("; ")}. Set APIFY_TOKEN in Vercel`);
    if (failedIg.length > 0)
      diagnosticParts.push(`Instagram: ${failedIg.map((d) => `${(d as { source?: string }).source ?? "?"} (${d.error})`).join("; ")}`);
    if (failedYt.length > 0)
      diagnosticParts.push(`YouTube: Set YOUTUBE_API_KEY in Vercel`);
    if (failedAgg.length > 0)
      diagnosticParts.push(`Aggregators: ${failedAgg.map((d) => `${d.url} (${d.error})`).join("; ")}`);
    const hint = diagnosticParts.length > 0 ? ` ${diagnosticParts.join(". ")}.` : "";

    return NextResponse.json(
      {
        error: `All sources returned 0 leads.${hint}`,
        diagnostics: { youtube: ytDiagnostics, reddit: redditDiagnostics, instagram: igDiagnostics, aggregator: aggDiagnostics },
      },
      { status: 400 }
    );
  }

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

  const parts: string[] = [];
  if (importedYt > 0) parts.push(`${importedYt} from YouTube`);
  if (importedRd > 0) parts.push(`${importedRd} from Reddit`);
  if (importedIg > 0) parts.push(`${importedIg} from Instagram`);
  if (importedAgg > 0) parts.push(`${importedAgg} from aggregators (OnlyFinder, FanFox, JuicySearch)`);
  const message = `Imported ${parts.join(", ")}.`;

  return NextResponse.json(
    {
      ok: true,
      imported,
      importedYt,
      importedRd,
      importedIg,
      importedAgg,
      diagnostics: { youtube: ytDiagnostics, reddit: redditDiagnostics, instagram: igDiagnostics, aggregator: aggDiagnostics },
      message,
    },
    { status: 201 }
  );
}
