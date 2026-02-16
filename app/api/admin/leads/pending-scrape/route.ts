import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Antigravity polls this endpoint (e.g. every 60 seconds). When there's a pending trigger,
 * we return hasPending: true and consume it. Antigravity then runs the scrape and POSTs to ingest.
 * Auth: Bearer ANTIGRAVITY_WEBHOOK_SECRET
 */
export async function GET(request: Request) {
  const secret = process.env.ANTIGRAVITY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : request.headers.get("x-webhook-secret");
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: row, error } = await admin
    .from("scrape_triggers")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ hasPending: false }, { status: 200 });
  }

  await admin.from("scrape_triggers").delete().eq("id", row.id);

  return NextResponse.json({ hasPending: true }, { status: 200 });
}
