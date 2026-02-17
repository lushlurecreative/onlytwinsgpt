/**
 * Reddit scraper - uses Apify automation-lab/reddit-scraper when APIFY_TOKEN is set.
 * No Reddit credentials needed. Falls back to empty if APIFY_TOKEN missing.
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
  sampleUrls?: string[];
};

const SUBREDDITS = [
  "OnlyFans",
  "Fansly",
  "OnlyFansPromotion",
  "FanslyCreators",
];

export type ScrapeResult = {
  leads: ScrapedLead[];
  diagnostics: { subreddit: string; ok: boolean; postCount?: number; error?: string }[];
};

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

  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    const err = "APIFY_TOKEN not set. Add it in Vercel (console.apify.com) for Reddit scraping.";
    diagnostics.push({ subreddit: "setup", ok: false, error: err });
    if (opts?.withDiagnostics) return { leads: [], diagnostics };
    return [];
  }

  try {
    const { ApifyClient } = await import("apify-client");
    const client = new ApifyClient({ token });

    const urls = SUBREDDITS.map((s) => `https://www.reddit.com/r/${s}/`);
    const run = await client.actor("automation-lab/reddit-scraper").call({
      urls,
      maxPostsPerSource: 50,
      sort: "new",
      includeComments: false,
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    const posts = (items ?? []) as Array<{
      type?: string;
      author?: string;
      subreddit?: string;
      score?: number;
      imageUrls?: string[];
      thumbnail?: string;
      url?: string;
      selftext?: string;
      title?: string;
      flair?: string;
      linkFlairText?: string;
    }>;

    for (const p of posts) {
      if (p.type !== "post") continue;
      const author = p.author;
      if (!author || author === "[deleted]" || seen.has(author.toLowerCase())) continue;

      const postText = [p.url ?? "", p.selftext ?? "", p.title ?? "", p.flair ?? "", p.linkFlairText ?? ""].join(" ");
      const hasCreatorLink = /onlyfans\.com|fansly\.com/i.test(postText);
      const hasCreatorFlair = /creator|onlyfans|fansly|verified/i.test((p.linkFlairText ?? p.flair ?? "").toLowerCase());
      if (!hasCreatorLink && !hasCreatorFlair) continue;

      seen.add(author.toLowerCase());

      const followerMin = criteria?.followerRange?.reddit?.min ?? 0;
      const score = p.score ?? 0;
      if (followerMin > 0 && score < followerMin / 1000) continue;

      const profileUrls: Record<string, string> = { reddit: `https://reddit.com/user/${author}` };
      const ofMatch = postText.match(/https?:\/\/(?:www\.)?onlyfans\.com\/(@?[a-zA-Z0-9_.-]+)/i);
      const fanslyMatch = postText.match(/https?:\/\/(?:www\.)?fansly\.com\/([a-zA-Z0-9_.-]+)/i);
      if (ofMatch) profileUrls.onlyfans = `https://onlyfans.com/${ofMatch[1].replace(/^@/, "")}`;
      if (fanslyMatch) profileUrls.fansly = `https://fansly.com/${fanslyMatch[1]}`;
      const platformsFound = ["reddit", ...(profileUrls.onlyfans ? ["onlyfans"] : []), ...(profileUrls.fansly ? ["fansly"] : [])].filter((x, i, a) => a.indexOf(x) === i);

      const sampleUrls: string[] = [];
      if (Array.isArray(p.imageUrls)) sampleUrls.push(...p.imageUrls.filter((u) => u?.startsWith("http")));
      if (p.thumbnail && p.thumbnail.startsWith("http") && !sampleUrls.includes(p.thumbnail)) {
        sampleUrls.push(p.thumbnail);
      }

      leads.push({
        handle: author,
        platform: "reddit",
        profileUrl: profileUrls.onlyfans ?? profileUrls.fansly ?? `https://reddit.com/user/${author}`,
        platformsFound,
        profileUrls,
        followerCount: Math.max(score, 0),
        engagementRate: 1,
        luxuryTagHits: 0,
        sampleUrls: sampleUrls.length ? sampleUrls.slice(0, 5) : undefined,
      });
    }

    for (const sub of SUBREDDITS) {
      const count = posts.filter((p) => p.subreddit === sub).length;
      diagnostics.push({ subreddit: sub, ok: true, postCount: count });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    diagnostics.push({ subreddit: "apify", ok: false, error: msg });
  }

  const result = leads.slice(0, 100);
  if (opts?.withDiagnostics) {
    return { leads: result, diagnostics };
  }
  return result;
}
