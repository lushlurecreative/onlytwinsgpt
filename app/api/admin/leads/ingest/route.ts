import { NextResponse } from "next/server";
import { ingestLeads, type IngestLeadInput } from "@/lib/ingest-leads";

/**
 * Webhook for Antigravity bot to push scraped leads.
 * Set ANTIGRAVITY_WEBHOOK_SECRET in Vercel. Bot sends:
 *   Authorization: Bearer <secret>
 *   X-Webhook-Secret: <secret>
 * Body: { leads: [{ handle, platform, profileUrl?, followerCount?, engagementRate?, luxuryTagHits?, notes?, sampleUrls?, samplePaths? }] }
 */
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

  let body: { leads?: unknown[] } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const leads = body.leads ?? [];
  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: "leads[] array is required" }, { status: 400 });
  }

  const { imported } = await ingestLeads(leads as IngestLeadInput[], "antigravity");

  if (imported === 0) {
    return NextResponse.json({ error: "No valid leads (handle required)" }, { status: 400 });
  }

  return NextResponse.json(
    { imported, message: "Leads imported from Antigravity bot" },
    { status: 201 }
  );
}
