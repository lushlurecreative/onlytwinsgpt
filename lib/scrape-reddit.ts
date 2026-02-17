/**
 * Reddit scraper - fetches recent posts from subreddits and extracts author handles as leads.
 * Used when "Run scrape" is triggered from admin (runs inline, no separate process).
 */

export type ScrapeCriteria = {
  followerRange?: Record<string, { min?: number; max?: number }>;
  platforms?: string[];
};

export type ScrapedLead = {
  handle: string;
  platform: string;
  profileUrl: string;
  platformsFound: string[];
  profileUrls: Record<string, string>;
  followerCount: number;
  engagementRate: number;
  luxuryTagHits: number;
};

const SUBREDDITS = [
  "Creators",
  "CreatorsAdvice",
  "Instagram",
  "influencermarketing",
  "NewTubers",
  "YouTubeCreators",
];

export type ScrapeResult = {
  leads: ScrapedLead[];
  diagnostics: { subreddit: string; ok: boolean; postCount?: number; error?: string }[];
};

export async function scrapeReddit(criteria: ScrapeCriteria = {}): Promise<ScrapedLead[]>;
export async function scrapeReddit(
  criteria: ScrapeCriteria,
  opts: { withDiagnostics: true }
): Promise<ScrapeResult>;
export async function scrapeReddit(
  criteria: ScrapeCriteria = {},
  opts?: { withDiagnostics?: boolean }
): Promise<ScrapedLead[] | ScrapeResult> {
  const leads: ScrapedLead[] = [];
  const seen = new Set<string>();
  const diagnostics: { subreddit: string; ok: boolean; postCount?: number; error?: string }[] = [];

  const userAgent = "web:com.onlytwins:v1.0 (by /u/onlytwins)";

  for (const sub of SUBREDDITS) {
    try {
      const url = `https://www.reddit.com/r/${sub}/new.json?limit=25`;
      const res = await fetch(url, {
        headers: { "User-Agent": userAgent },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        diagnostics.push({ subreddit: sub, ok: false, error: `HTTP ${res.status}` });
        continue;
      }
      const data = (await res.json()) as {
        data?: { children?: Array<{ data?: { author?: string; score?: number; ups?: number } }> };
      };
      const posts = data?.data?.children ?? [];
      diagnostics.push({ subreddit: sub, ok: true, postCount: posts.length });

      for (const p of posts) {
        const author = p?.data?.author;
        if (!author || author === "[deleted]" || seen.has(author.toLowerCase())) continue;
        seen.add(author.toLowerCase());

        const followerMin = criteria?.followerRange?.reddit?.min ?? 0;
        const ups = p?.data?.ups ?? p?.data?.score ?? 0;
        if (followerMin > 0 && ups < followerMin / 1000) continue;

        leads.push({
          handle: author,
          platform: "reddit",
          profileUrl: `https://reddit.com/user/${author}`,
          platformsFound: ["reddit"],
          profileUrls: { reddit: `https://reddit.com/user/${author}` },
          followerCount: Math.max(ups, 0),
          engagementRate: 1,
          luxuryTagHits: 0,
        });
      }
    } catch (err) {
      diagnostics.push({
        subreddit: sub,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result = leads.slice(0, 20);
  if (opts?.withDiagnostics) {
    return { leads: result, diagnostics };
  }
  return result;
}
