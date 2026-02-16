import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { scrapeReddit, type ScrapeCriteria } from "@/lib/scrape-reddit";

export type { ScrapeCriteria };

/**
 * Admin clicks "Run scrape" - runs the scrape inline and ingests leads. No separate process.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let criteria: ScrapeCriteria = {};
  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body.criteria === "object" && body.criteria !== null) {
      criteria = body.criteria as ScrapeCriteria;
    }
  } catch {
    // no body or invalid JSON - use defaults
  }

  const leads = await scrapeReddit(criteria);
  if (leads.length === 0) {
    return NextResponse.json(
      { ok: true, imported: 0, message: "No leads found this run." },
      { status: 200 }
    );
  }

  const secret = process.env.ANTIGRAVITY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "ANTIGRAVITY_WEBHOOK_SECRET not configured" },
      { status: 503 }
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    (request.headers.get("x-vercel-url") ? `https://${request.headers.get("x-vercel-url")}` : null) ??
    new URL(request.url).origin;
  const ingestUrl = `${origin.replace(/\/$/, "")}/api/admin/leads/ingest`;

  const ingestRes = await fetch(ingestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ leads }),
  });

  if (!ingestRes.ok) {
    const text = await ingestRes.text();
    return NextResponse.json(
      { error: `Ingest failed: ${ingestRes.status} ${text}` },
      { status: 500 }
    );
  }

  const result = (await ingestRes.json()) as { imported?: number };
  return NextResponse.json(
    {
      ok: true,
      imported: result.imported ?? leads.length,
      message: `Imported ${result.imported ?? leads.length} leads.`,
    },
    { status: 201 }
  );
}
