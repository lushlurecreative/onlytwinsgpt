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

/**
 * 0 = no photos and no user info (lowest value)
 * 5 = user info only (profile URL, handle, platformsFound)
 * 10 = at least 3 photos + user info (highest value)
 */
function scoreLead(input: {
  hasUserInfo: boolean;
  sampleCount: number;
}) {
  const { hasUserInfo, sampleCount } = input;
  const hasEnoughPhotos = sampleCount >= 3;
  if (!hasUserInfo && !hasEnoughPhotos) return 0;
  if (hasUserInfo && !hasEnoughPhotos) return 5;
  if (hasUserInfo && hasEnoughPhotos) return 10;
  return 0;
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
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
          Referer: new URL(url).origin + "/",
        },
      });
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

async function insertViaPg(row: {
  source: string;
  handle: string;
  platform: string;
  follower_count: number;
  engagement_rate: number;
  luxury_tag_hits: number;
  score: number;
  profile_url: string | null;
  notes: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return { ok: false, error: "DATABASE_URL not set" };
  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(
      `insert into public.leads (source, handle, platform, follower_count, engagement_rate, luxury_tag_hits, score, profile_url, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        row.source,
        row.handle,
        row.platform,
        row.follower_count,
        row.engagement_rate,
        row.luxury_tag_hits,
        row.score,
        row.profile_url,
        row.notes,
      ]
    );
    await client.end();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Insert leads into the leads table. Returns number of successfully imported leads.
 */
export async function ingestLeads(
  leads: IngestLeadInput[],
  source: "reddit" | "youtube" | "antigravity" | "aggregator" | "instagram" = "antigravity"
): Promise<{ imported: number; firstError?: string }> {
  const admin = getSupabaseAdmin();
  await runMigrations();
  let imported = 0;
  let firstError: string | undefined;

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

    const hasUserInfo =
      !!profileUrl ||
      !!handle ||
      platformsFound.length > 0 ||
      (profileUrls && typeof profileUrls === "object" && Object.keys(profileUrls).length > 0);
    const sampleCount = samplePaths.length || (Array.isArray(lead.sampleUrls) ? lead.sampleUrls.length : 0);
    const minimalRow = {
      source,
      handle,
      platform,
      follower_count: followerCount,
      engagement_rate: engagementRate,
      luxury_tag_hits: luxuryTagHits,
      score: scoreLead({ hasUserInfo, sampleCount }),
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
    if (error) {
      const r2 = await admin.from("leads").insert(withSamples);
      error = r2.error;
    }
    if (error) {
      const r3 = await admin.from("leads").insert(minimalRow);
      error = r3.error;
    }
    if (error) {
      if (!firstError) firstError = error.message;
      const pgResult = await insertViaPg({
        source: minimalRow.source,
        handle: minimalRow.handle,
        platform: minimalRow.platform,
        follower_count: minimalRow.follower_count,
        engagement_rate: minimalRow.engagement_rate,
        luxury_tag_hits: minimalRow.luxury_tag_hits,
        score: minimalRow.score,
        profile_url: minimalRow.profile_url,
        notes: minimalRow.notes,
      });
      if (pgResult.ok) {
        imported += 1;
      } else if (!firstError) {
        firstError = pgResult.error;
      }
    } else {
      imported += 1;
    }
  }

  return { imported, firstError };
}
