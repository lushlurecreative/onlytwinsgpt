import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runActorAndGetItems } from "@/lib/apify";

const INSTAGRAM_ACTOR_ID = process.env.APIFY_INSTAGRAM_ACTOR_ID || "apify/instagram-profile-scraper";

function getCronSecret(): string {
  return process.env.CRON_SECRET?.trim() || "";
}

/** Upsert one lead from Apify profile item (Instagram). Dedupe by (platform, handle). */
async function upsertLead(admin: ReturnType<typeof getSupabaseAdmin>, item: Record<string, unknown>) {
  const handle = (item.username as string) || (item.fullName as string) || "";
  if (!handle) return;
  const platform = "instagram";
  const profileUrl = (item.profileUrl as string) || (item.url as string) || "";
  const displayName = (item.fullName as string) || (item.name as string) || "";
  const bio = (item.biography as string) || "";
  const followerCount = typeof item.followersCount === "number" ? item.followersCount : 0;
  const photoCount = typeof item.mediasCount === "number" ? item.mediasCount : 0;
  const imageUrls = (item.profilePicUrl as string) ? [(item.profilePicUrl as string)] : [];
  const imageUrlsJson = Array.isArray(item.images) ? item.images : imageUrls;

  const { data: existing } = await admin
    .from("leads")
    .select("id, created_at")
    .eq("platform", platform)
    .eq("handle", handle)
    .maybeSingle();

  const now = new Date().toISOString();
  const row = {
    platform,
    handle,
    source: "apify_cron",
    profile_url: profileUrl || null,
    display_name: displayName || null,
    bio: bio || null,
    follower_count: followerCount,
    photo_count: photoCount,
    image_urls_json: imageUrlsJson,
    last_seen_at: now,
    is_new: !existing,
    status: existing ? "imported" : "imported",
    updated_at: now,
  };

  if (existing) {
    await admin.from("leads").update(row).eq("id", existing.id);
  } else {
    await admin.from("leads").insert({
      ...row,
      created_at: now,
      engagement_rate: 0,
      luxury_tag_hits: 0,
      score: 0,
    });
  }
}

/** Qualify leads: photo_count >= 3 -> status = qualified. */
async function qualifyLeads(admin: ReturnType<typeof getSupabaseAdmin>) {
  const { data: rows } = await admin
    .from("leads")
    .select("id")
    .eq("status", "imported")
    .gte("photo_count", 3);
  if (!rows?.length) return;
  await admin
    .from("leads")
    .update({ status: "qualified", updated_at: new Date().toISOString() })
    .in("id", rows.map((r) => r.id));
}

export async function GET(request: Request) {
  const secret = getCronSecret();
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (secret && bearer !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  const handlesKey = await admin.from("app_settings").select("value").eq("key", "lead_scrape_handles").maybeSingle();
  const handlesStr = (handlesKey.data?.value as string) || "";
  const handles = handlesStr.split(",").map((h) => h.trim()).filter(Boolean);

  let imported = 0;
  if (handles.length > 0) {
    const input = { usernames: handles };
    const items = await runActorAndGetItems(INSTAGRAM_ACTOR_ID, input);
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item && typeof item === "object") {
          await upsertLead(admin, item as Record<string, unknown>);
          imported++;
        }
      }
    }
  }

  await qualifyLeads(admin);

  await admin.from("automation_events").insert({
    event_type: "scrape_run",
    entity_type: "cron",
    payload_json: { imported, handles_count: handles.length },
  });

  return NextResponse.json({ ok: true, imported });
}
