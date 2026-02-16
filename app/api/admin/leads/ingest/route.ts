import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Webhook for Antigravity bot to push scraped leads.
 * Set ANTIGRAVITY_WEBHOOK_SECRET in Vercel. Bot sends:
 *   Authorization: Bearer <secret>
 *   X-Webhook-Secret: <secret>
 * Body: { leads: [{ handle, platform, profileUrl?, followerCount?, engagementRate?, luxuryTagHits?, notes?, sampleUrls?, samplePaths? }] }
 * sampleUrls: fetch and store 3-5 photos. samplePaths: use existing storage paths.
 */

type IngestLead = {
  handle: string;
  platform: string;
  profileUrl?: string;
  followerCount?: number;
  engagementRate?: number;
  luxuryTagHits?: number;
  notes?: string;
  sampleUrls?: string[];
  samplePaths?: string[];
};

function scoreLead(input: {
  followerCount: number;
  engagementRate: number;
  luxuryTagHits: number;
}) {
  const followerScore = Math.min(50, Math.floor(input.followerCount / 5000));
  const engagementScore = Math.min(30, Math.floor(input.engagementRate * 4));
  const luxuryScore = Math.min(20, input.luxuryTagHits * 2);
  return followerScore + engagementScore + luxuryScore;
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

export async function POST(request: Request) {
  const secret = process.env.ANTIGRAVITY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "ANTIGRAVITY_WEBHOOK_SECRET not configured" },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const webhookSecret = request.headers.get("x-webhook-secret");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : webhookSecret;
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { leads?: IngestLead[] } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const leads = body.leads ?? [];
  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: "leads[] array is required" }, { status: 400 });
  }

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
        .filter((p: unknown) => typeof p === "string" && p.trim())
        .map((p: string) => p.trim())
        .slice(0, 5);
    } else if (Array.isArray(lead.sampleUrls) && lead.sampleUrls.length > 0) {
      samplePaths = await fetchAndUploadSamples(admin, lead.sampleUrls);
    }
    const row = {
      source: "antigravity",
      handle,
      platform,
      follower_count: followerCount,
      engagement_rate: engagementRate,
      luxury_tag_hits: luxuryTagHits,
      score: scoreLead({ followerCount, engagementRate, luxuryTagHits }),
      profile_url:
        typeof lead.profileUrl === "string" && lead.profileUrl.trim() ? lead.profileUrl.trim() : null,
      notes: typeof lead.notes === "string" && lead.notes.trim() ? lead.notes.trim() : null,
      sample_paths: samplePaths,
    };
    const { error } = await admin.from("leads").insert(row);
    if (!error) imported += 1;
  }

  if (imported === 0) {
    return NextResponse.json({ error: "No valid leads (handle required)" }, { status: 400 });
  }

  return NextResponse.json(
    { imported, message: "Leads imported from Antigravity bot" },
    { status: 201 }
  );
}
