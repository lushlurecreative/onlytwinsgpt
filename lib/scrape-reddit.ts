/**
 * Reddit scraper - fetches recent posts from subreddits and extracts author handles as leads.
 * Uses OAuth when REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are set (required since Reddit blocks unauthenticated requests).
 * Create an app at https://www.reddit.com/prefs/apps (Script or Web type) and add credentials to Vercel.
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

const USER_AGENT = "web:com.onlytwins:v1.0 (by /u/onlytwins)";

async function getRedditAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID?.trim();
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

export async function scrapeReddit(criteria?: ScrapeCriteria): Promise<ScrapedLead[]>;
export async function scrapeReddit(
  criteria: ScrapeCriteria | undefined,
  opts: { withDiagnostics: true }
): Promise<ScrapeResult>;
export async function scrapeReddit(
  criteria: ScrapeCriteria = {},
  opts?: { withDiagnostics?: boolean }
): Promise<ScrapedLead[] | ScrapeResult> {
  const leads: ScrapedLead[] = [];
  const seen = new Set<string>();
  const diagnostics: { subreddit: string; ok: boolean; postCount?: number; error?: string }[] = [];

  const token = await getRedditAccessToken();
  if (!token) {
    const err = "REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET not set. Add them in Vercel (create app at reddit.com/prefs/apps)";
    diagnostics.push({ subreddit: "setup", ok: false, error: err });
    if (opts?.withDiagnostics) return { leads: [], diagnostics };
    return [];
  }

  const baseUrl = "https://oauth.reddit.com";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
  };

  for (const sub of SUBREDDITS) {
    try {
      const url = `${baseUrl}/r/${sub}/new.json?limit=25`;
      const res = await fetch(url, {
        headers,
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
