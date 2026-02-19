/**
 * YouTube scraper - fetches channels matching creator-related queries via YouTube Data API v3.
 * Requires YOUTUBE_API_KEY. Used when "Run scrape" is triggered from admin.
 */

import type { ScrapedLead } from "./scrape-reddit";

export type ScrapeCriteria = {
  followerRange?: Record<string, { min?: number; max?: number }>;
  platforms?: string[];
};

const SEARCH_QUERIES = [
  "content creator",
  "influencer",
  "creator economy",
  "YouTuber",
  "vlog",
  "OnlyFans creator",
  "adult content creator",
  "subscription creator",
];

export type YouTubeScrapeResult = {
  leads: ScrapedLead[];
  diagnostics: { query: string; ok: boolean; channelCount?: number; error?: string }[];
};

export async function scrapeYouTube(
  criteria: ScrapeCriteria = {},
  opts?: { withDiagnostics?: boolean }
): Promise<ScrapedLead[] | YouTubeScrapeResult> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    if (opts?.withDiagnostics) {
      return { leads: [], diagnostics: [{ query: "setup", ok: false, error: "YOUTUBE_API_KEY not set" }] };
    }
    return [];
  }

  const leads: ScrapedLead[] = [];
  const seen = new Set<string>();
  const diagnostics: { query: string; ok: boolean; channelCount?: number; error?: string }[] = [];

  const followerMin = criteria?.followerRange?.youtube?.min ?? 0;

  for (const q of SEARCH_QUERIES) {
    try {
      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("type", "channel");
      searchUrl.searchParams.set("q", q);
      searchUrl.searchParams.set("maxResults", "50");
      searchUrl.searchParams.set("key", apiKey);

      const searchRes = await fetch(searchUrl.toString(), {
        signal: AbortSignal.timeout(15000),
      });

      if (!searchRes.ok) {
        const errBody = await searchRes.text();
        diagnostics.push({ query: q, ok: false, error: `HTTP ${searchRes.status}: ${errBody.slice(0, 80)}` });
        continue;
      }

      const searchData = (await searchRes.json()) as {
        items?: Array<{
          id?: { kind?: string; channelId?: string };
          snippet?: { channelTitle?: string; channelId?: string };
        }>;
      };

      const items = searchData?.items ?? [];
      const channelIds = items
        .filter((i) => i?.id?.kind === "youtube#channel" && i?.id?.channelId)
        .map((i) => i.id!.channelId!)
        .filter((id) => !seen.has(id.toLowerCase()));

      if (channelIds.length === 0) {
        diagnostics.push({ query: q, ok: true, channelCount: 0 });
        continue;
      }

      for (const id of channelIds) seen.add(id.toLowerCase());

      // Fetch channel stats (subscriber count)
      const idsParam = channelIds.slice(0, 20).join(",");
      const channelsUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
      channelsUrl.searchParams.set("part", "snippet,statistics");
      channelsUrl.searchParams.set("id", idsParam);
      channelsUrl.searchParams.set("key", apiKey);

      const channelsRes = await fetch(channelsUrl.toString(), {
        signal: AbortSignal.timeout(15000),
      });

      if (!channelsRes.ok) {
        diagnostics.push({ query: q, ok: false, error: `channels HTTP ${channelsRes.status}` });
        continue;
      }

      const channelsData = (await channelsRes.json()) as {
        items?: Array<{
          id: string;
          snippet?: {
            title?: string;
            description?: string;
            customUrl?: string;
            thumbnails?: { default?: { url?: string }; medium?: { url?: string }; high?: { url?: string } };
          };
          statistics?: { subscriberCount?: string; videoCount?: string };
        }>;
      };

      const channels = channelsData?.items ?? [];
      diagnostics.push({ query: q, ok: true, channelCount: channels.length });

      for (const ch of channels) {
        const subCount = parseInt(ch.statistics?.subscriberCount ?? "0", 10);
        if (followerMin > 0 && subCount < followerMin) continue;

        const description = ch.snippet?.description ?? "";
        const hasCreatorSignal = /onlyfans\.com|fansly\.com|instagram\.com/i.test(description);
        if (!hasCreatorSignal) continue;

        const profileUrls: Record<string, string> = { youtube: `https://youtube.com/channel/${ch.id}` };
        const ofMatch = description.match(/https?:\/\/(?:www\.)?onlyfans\.com\/(@?[a-zA-Z0-9_.-]+)/i);
        const fanslyMatch = description.match(/https?:\/\/(?:www\.)?fansly\.com\/([a-zA-Z0-9_.-]+)/i);
        const igMatch = description.match(/https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/i);
        if (ofMatch) profileUrls.onlyfans = `https://onlyfans.com/${ofMatch[1].replace(/^@/, "")}`;
        if (fanslyMatch) profileUrls.fansly = `https://fansly.com/${fanslyMatch[1]}`;
        if (igMatch) profileUrls.instagram = `https://instagram.com/${igMatch[1]}`;
        const platformsFound = ["youtube", ...Object.keys(profileUrls).filter((k) => k !== "youtube")];

        const handle = ch.snippet?.customUrl?.replace(/^@/, "") ?? ch.snippet?.title ?? ch.id;
        const profileUrl = profileUrls.onlyfans ?? profileUrls.fansly ?? profileUrls.instagram ?? profileUrls.youtube;
        const thumb = ch.snippet?.thumbnails?.high?.url ?? ch.snippet?.thumbnails?.medium?.url ?? ch.snippet?.thumbnails?.default?.url;
        leads.push({
          handle,
          platform: "youtube",
          profileUrl,
          platformsFound,
          profileUrls,
          followerCount: subCount,
          engagementRate: 0,
          luxuryTagHits: 0,
          sampleUrls: thumb ? [thumb] : undefined,
        });
      }
    } catch (err) {
      diagnostics.push({
        query: q,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result = leads.slice(0, 2000);
  if (opts?.withDiagnostics) {
    return { leads: result, diagnostics };
  }
  return result;
}
