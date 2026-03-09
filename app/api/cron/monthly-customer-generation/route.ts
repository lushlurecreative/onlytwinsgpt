import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { processPendingCustomerGeneration, scheduleMonthlyCustomerBatches } from "@/lib/customer-generation-processor";

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
  const queued = await scheduleMonthlyCustomerBatches(admin, 300);
  const processed = await processPendingCustomerGeneration(admin, 25);
  await admin.from("system_events").insert({
    event_type: "monthly_customer_generation_run",
    payload: {
      queued_count: queued.length,
      processed_count: processed.length,
      queued_request_ids: queued,
    },
  });
  return NextResponse.json({ ok: true, queued, processed }, { status: 200 });
}

