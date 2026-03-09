import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { processPendingCustomerGeneration } from "@/lib/customer-generation-processor";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() || "";
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return bearer === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  const processed = await processPendingCustomerGeneration(admin, 25);
  await admin.from("system_events").insert({
    event_type: "customer_generation_processor_run",
    payload: {
      processed_count: processed.length,
      request_ids: processed.map((row) => row.requestId),
    },
  });
  return NextResponse.json({ ok: true, processed }, { status: 200 });
}

