/**
 * Inserts leads into the database. Used by trigger-scrape (inline) and ingest webhook.
 * No auth - caller must verify before invoking.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runMigrations } from "@/lib/run-migrations";

export type IngestLeadInput = {
  handle: string;
  platform: string;
  profileUrl?: string;
  profileUrls?: Record<string, string>;
  platformsFound?: string[];
  followerCount?: number;
  engagementRate?: number;
  luxuryTagHits?: number;
  notes?: string;
  sampleUrls?: string[];
  samplePaths?: string[];
  contentVerticals?: string[];
};

function scoreLead(input: {
  followerCount: number;
  engagementRate: number;
  luxuryTagHits: number;
  platformsFoundCount?: number;
  contentVerticalsCount?: number;
}) {
  const followerScore = Math.min(50, Math.floor(input.followerCount / 5000));
  const engagementScore = Math.min(30, Math.floor(input.engagementRate * 4));
  const luxuryScore = Math.min(20, input.luxuryTagHits * 2);
  const platformsBonus = Math.min(10, (input.platformsFoundCount ?? 0) * 2);
  const verticalsBonus = Math.min(5, input.contentVerticalsCount ?? 0);
  return followerScore + engagementScore + luxuryScore + platformsBonus + verticalsBonus;
}

async function fetchAndUploadSamples(
  admin: ReturnType<typeof getSupabaseAdmin>,
  urls: string[]
): Promise<string[]> {
  const paths: string[] = [];
  const folder = `leads/${crypto.randomUUID()}`;
  const allowed = urls.slice(0, 5);
  for (let i = 0; i < allowed.length; i += 1) {
    const url = allowed[i];
    if (typeof url !== "string" || !url.startsWith("http")) continue;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const ext = url.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
      const objectPath = `${folder}/${i}.${safeExt}`;
      const { error } = await admin.storage.from("uploads").upload(objectPath, bytes, {
        contentType: res.headers.get("content-type") || `image/${safeExt}`,
        upsert: false,
      });
      if (!error) paths.push(objectPath);
    } catch {
      // Skip failed fetch/upload
    }
  }
  return paths;
}

/**
 * Insert leads into the leads table. Returns number of successfully imported leads.
 */
export async function ingestLeads(
  leads: IngestLeadInput[],
  source: "reddit" | "antigravity" = "antigravity"
): Promise<{ imported: number }> {
  const admin = getSupabaseAdmin();
  let imported = 0;

  for (const lead of leads) {
    if (typeof lead?.handle !== "string" || !lead.handle.trim()) continue;
    const handle = String(lead.handle).trim();
    const platform = String(lead.platform ?? "unknown").trim() || "unknown";
    const followerCount = Math.max(0, Number(lead.followerCount ?? 0));
    const engagementRate = Math.max(0, Number(lead.engagementRate ?? 0));
    const luxuryTagHits = Math.max(0, Number(lead.luxuryTagHits ?? 0));
    let samplePaths: string[] = [];
    if (Array.isArray(lead.samplePaths) && lead.samplePaths.length > 0) {
      samplePaths = lead.samplePaths
        .filter((p: unknown) => typeof p === "string" && (p as string).trim())
        .map((p: string) => p.trim())
        .slice(0, 5);
    } else if (Array.isArray(lead.sampleUrls) && lead.sampleUrls.length > 0) {
      samplePaths = await fetchAndUploadSamples(admin, lead.sampleUrls);
    }
    const profileUrl =
      typeof lead.profileUrl === "string" && lead.profileUrl.trim()
        ? lead.profileUrl.trim()
        : null;
    const profileUrls =
      lead.profileUrls && typeof lead.profileUrls === "object"
        ? (lead.profileUrls as Record<string, string>)
        : {};
    const platformsFound = Array.isArray(lead.platformsFound)
      ? lead.platformsFound
          .filter((p: unknown) => typeof p === "string" && (p as string).trim())
          .map((p: string) => (p as string).trim())
          .slice(0, 20)
      : [];
    const contentVerticals = Array.isArray(lead.contentVerticals)
      ? lead.contentVerticals
          .filter((c: unknown) => typeof c === "string" && (c as string).trim())
          .map((c: string) => (c as string).trim().toLowerCase())
          .slice(0, 10)
      : [];

    const minimalRow = {
      source,
      handle,
      platform,
      follower_count: followerCount,
      engagement_rate: engagementRate,
      luxury_tag_hits: luxuryTagHits,
      score: scoreLead({
        followerCount,
        engagementRate,
        luxuryTagHits,
        platformsFoundCount: platformsFound.length,
        contentVerticalsCount: contentVerticals.length,
      }),
      profile_url: profileUrl,
      notes: typeof lead.notes === "string" && lead.notes.trim() ? lead.notes.trim() : null,
    };
    const withSamples = { ...minimalRow, sample_paths: samplePaths };
    const fullRow = {
      ...withSamples,
      profile_urls: profileUrls,
      platforms_found: platformsFound,
      content_verticals: contentVerticals,
    };
    let { error } = await admin.from("leads").insert(fullRow);
    if (error?.message?.includes("does not exist")) {
      await runMigrations();
      const retry = await admin.from("leads").insert(fullRow);
      error = retry.error;
    }
    if (error?.message?.includes("does not exist")) {
      const retry = await admin.from("leads").insert(withSamples);
      error = retry.error;
    }
    if (error?.message?.includes("does not exist")) {
      const retry = await admin.from("leads").insert(minimalRow);
      error = retry.error;
    }
    if (!error) imported += 1;
  }

  return { imported };
}
