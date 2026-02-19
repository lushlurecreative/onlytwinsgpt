/**
 * Instagram scraper - uses Apify hashtag and search scrapers.
 * Focus: swimsuits, lingerie, OF, adult creators. Curated hashtags + username "of" search.
 */

import type { ScrapedLead } from "./scrape-reddit";

// Platform-Specific (Direct): #OnlyFans, #PremiumContent, #ExclusiveContent, #SupportCreators
// Suggestive: #NSFW, #LinkInBio, #Spicy, #Exclusive
// Platform-Specific: #FanPage, #Subscribers, #CreatorLife
// Niche (Fitness/Models, Glamour/Art, Alternative): #FitnessModel, #GymGirl, #GirlsWhoLift, #FitInspo, #BoudoirPhotography, #SensualArt, #Modellife, #ArtisticNude, #KinkFriendly, #FetishCommunity, #CosplayGirl, #GamerGirl
// Scouting / New Talent: #WLYG, #MakeMeElite, #WeScoutUSA, #ModelScout, #AspiringModel, #NewFace, #ContentCreator
const HASHTAGS = [
  "FitnessModel",
  "BoudoirPhotography",
  "OnlyFans",
  "PremiumContent",
  "ExclusiveContent",
  "SupportCreators",
  "NSFW",
  "LinkInBio",
  "Spicy",
  "Exclusive",
  "FanPage",
  "Subscribers",
  "CreatorLife",
  "GymGirl",
  "GirlsWhoLift",
  "FitInspo",
  "SensualArt",
  "Modellife",
  "ArtisticNude",
  "KinkFriendly",
  "FetishCommunity",
  "CosplayGirl",
  "GamerGirl",
  "WLYG",
  "MakeMeElite",
  "WeScoutUSA",
  "ModelScout",
  "AspiringModel",
  "NewFace",
  "ContentCreator",
  "BoudoirModel",
];

const USERNAME_SEARCH_TERMS = ["of", "onlyfans"];

export type InstagramScrapeResult = {
  leads: ScrapedLead[];
  diagnostics: { source: string; ok: boolean; leadCount?: number; error?: string }[];
};

export async function scrapeInstagram(opts?: {
  followerFloor?: number;
  maxHashtags?: number;
  maxResultsPerHashtag?: number;
  withDiagnostics?: boolean;
}): Promise<ScrapedLead[] | InstagramScrapeResult> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    const diagnostics: InstagramScrapeResult["diagnostics"] = [
      { source: "setup", ok: false, error: "APIFY_TOKEN not set" },
    ];
    if (opts?.withDiagnostics) return { leads: [], diagnostics };
    return [];
  }

  const followerFloor = opts?.followerFloor ?? 0;
  const maxHashtags = opts?.maxHashtags ?? 10;
  const maxResultsPerHashtag = opts?.maxResultsPerHashtag ?? 50;
  const diagnostics: InstagramScrapeResult["diagnostics"] = [];
  const leadMap = new Map<string, ScrapedLead>();

  function addLead(lead: ScrapedLead) {
    if (followerFloor > 0 && lead.followerCount < followerFloor) return;
    const key = `instagram:${lead.handle.toLowerCase()}`;
    const existing = leadMap.get(key);
    if (!existing || (lead.sampleUrls?.length ?? 0) > (existing.sampleUrls?.length ?? 0)) {
      leadMap.set(key, lead);
    }
  }

  try {
    const { ApifyClient } = await import("apify-client");
    const client = new ApifyClient({ token });

    // 1. Hashtag scraper - primary tags first
    const hashtagsToScrape = HASHTAGS.slice(0, maxHashtags);
    const hashtagInput = hashtagsToScrape.map((h) => (h.startsWith("#") ? h : `#${h}`));
    try {
      const run = await client.actor("apify/instagram-hashtag-scraper").call({
        hashtags: hashtagInput,
        resultsLimit: maxResultsPerHashtag * hashtagInput.length,
        sort: "recent",
      });
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      const posts = (items ?? []) as Array<{
        ownerUsername?: string;
        ownerFullName?: string;
        ownerId?: string;
        displayUrl?: string;
        videoUrl?: string;
        images?: Array<{ url?: string }>;
        likesCount?: number;
        timestamp?: string;
      }>;
      const byOwner = new Map<string, typeof posts>();
      for (const p of posts) {
        const u = p.ownerUsername?.toLowerCase();
        if (!u) continue;
        if (!byOwner.has(u)) byOwner.set(u, []);
        byOwner.get(u)!.push(p);
      }
      for (const [username, ownerPosts] of byOwner) {
        const urls: string[] = [];
        const seen = new Set<string>();
        for (const p of ownerPosts) {
          if (p.displayUrl && !seen.has(p.displayUrl)) {
            seen.add(p.displayUrl);
            urls.push(p.displayUrl);
          }
          if (p.videoUrl && !seen.has(p.videoUrl)) {
            seen.add(p.videoUrl);
            urls.push(p.videoUrl);
          }
          for (const img of p.images ?? []) {
            if (img.url && !seen.has(img.url)) {
              seen.add(img.url);
              urls.push(img.url);
            }
          }
        }
        addLead({
          handle: username,
          platform: "instagram",
          profileUrl: `https://instagram.com/${username}`,
          platformsFound: ["instagram"],
          profileUrls: { instagram: `https://instagram.com/${username}` },
          followerCount: 0,
          engagementRate: ownerPosts.some((p) => (p.likesCount ?? 0) > 0) ? 1 : 0,
          luxuryTagHits: 0,
          sampleUrls: urls.slice(0, 5).length ? urls.slice(0, 5) : undefined,
        });
      }
      diagnostics.push({ source: "hashtag", ok: true, leadCount: byOwner.size });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      diagnostics.push({ source: "hashtag", ok: false, error: msg });
    }

    // 2. Profile search - usernames containing "of"
    for (const term of USERNAME_SEARCH_TERMS) {
      try {
        const run = await client.actor("apify/instagram-search-scraper").call({
          searchType: "profile",
          searchTerms: term,
          resultsLimit: 30,
        });
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        const profiles = (items ?? []) as Array<{
          username?: string;
          fullName?: string;
          followersCount?: number;
          profilePicUrl?: string;
          externalUrl?: string;
          biography?: string;
          isBusinessAccount?: boolean;
          latestPosts?: Array<{ displayUrl?: string; videoUrl?: string }>;
        }>;
        for (const p of profiles) {
          const username = p.username?.toLowerCase();
          if (!username) continue;
          if (!username.includes("of")) continue;
          if (followerFloor > 0 && (p.followersCount ?? 0) < followerFloor) continue;
          const latestUrls: string[] = [];
          for (const post of p.latestPosts ?? []) {
            if (post.displayUrl) latestUrls.push(post.displayUrl);
            if (post.videoUrl) latestUrls.push(post.videoUrl);
          }
          addLead({
            handle: p.username!,
            platform: "instagram",
            profileUrl: `https://instagram.com/${p.username}`,
            platformsFound: ["instagram"],
            profileUrls: { instagram: `https://instagram.com/${p.username}` },
            followerCount: p.followersCount ?? 0,
            engagementRate: 1,
            luxuryTagHits: 0,
            sampleUrls:
              latestUrls.length > 0
                ? latestUrls.slice(0, 5)
                : p.profilePicUrl
                  ? [p.profilePicUrl]
                  : undefined,
          });
        }
        diagnostics.push({ source: `profile:${term}`, ok: true, leadCount: profiles.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        diagnostics.push({ source: `profile:${term}`, ok: false, error: msg });
      }
    }

    const leads = Array.from(leadMap.values()).slice(0, 3000);
    if (opts?.withDiagnostics) {
      return { leads, diagnostics };
    }
    return leads;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    diagnostics.push({ source: "instagram", ok: false, error: msg });
    if (opts?.withDiagnostics) return { leads: [], diagnostics };
    return [];
  }
}
