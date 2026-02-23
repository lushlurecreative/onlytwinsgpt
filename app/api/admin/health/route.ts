import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const HEARTBEAT_STALE_MS = 5 * 60 * 1000; // 5 minutes
const WEBHOOK_STALE_MS = 5 * 60 * 1000; // 5 minutes
const WEBHOOK_LOOKBACK_MS = 60 * 60 * 1000; // last hour

export type HealthStatus = "green" | "yellow" | "red";

export async function GET() {
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

  const admin = getSupabaseAdmin();
  const now = new Date();
  const timestamp = now.toISOString();
  const nowMs = now.getTime();

  const reasons: string[] = [];
  let status: HealthStatus = "green";

  // Worker heartbeat: latest worker_heartbeat from system_events
  let heartbeatStale = false;
  let heartbeatMissing = false;
  let systemEventsMissing = false;

  const { data: heartbeatRow, error: heartbeatError } = await admin
    .from("system_events")
    .select("created_at")
    .eq("event_type", "worker_heartbeat")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let heartbeatAge: number | null = null;

  if (heartbeatError) {
    const code = (heartbeatError as { code?: string }).code;
    if (code === "42P01") {
      systemEventsMissing = true;
      reasons.push("system_events table missing");
    } else {
      reasons.push("Worker heartbeat check failed");
      status = "red";
    }
  } else if (!heartbeatRow?.created_at) {
    heartbeatMissing = true;
    reasons.push("Worker heartbeat missing");
    status = "yellow";
  } else {
    heartbeatAge = nowMs - new Date(heartbeatRow.created_at).getTime();
    if (heartbeatAge > HEARTBEAT_STALE_MS) {
      heartbeatStale = true;
      reasons.push("Worker heartbeat stale (>5 min)");
      status = status === "green" ? "yellow" : status;
    }
  }

  if (heartbeatStale && heartbeatAge != null && heartbeatAge > 15 * 60 * 1000) {
    status = "red";
  }
  if (heartbeatMissing && status === "green") {
    status = "yellow";
  }

  // Webhook failures: last hour, processed_at null, received_at older than 5 min
  let stalePendingCount = 0;
  let webhookTableMissing = false;

  const oneHourAgo = new Date(nowMs - WEBHOOK_LOOKBACK_MS).toISOString();
  const { data: webhookRows, error: webhookError } = await admin
    .from("stripe_webhook_events")
    .select("id, received_at, processed_at")
    .gte("received_at", oneHourAgo)
    .is("processed_at", null);

  if (webhookError) {
    const code = (webhookError as { code?: string }).code;
    if (code === "42P01") {
      webhookTableMissing = true;
      if (!reasons.includes("stripe_webhook_events missing")) reasons.push("stripe_webhook_events missing");
    } else {
      reasons.push("Webhook health check failed");
      if (status === "green") status = "yellow";
    }
  } else {
    const cutoff = nowMs - WEBHOOK_STALE_MS;
    stalePendingCount = (webhookRows ?? []).filter(
      (r: { received_at: string }) => new Date(r.received_at).getTime() < cutoff
    ).length;
    if (stalePendingCount > 0) {
      reasons.push(`Webhook backlog: ${stalePendingCount} stale event(s)`);
      if (status === "green") status = "yellow";
      if (stalePendingCount >= 10) status = "red";
    }
  }

  if (systemEventsMissing && status === "green") status = "yellow";
  if (webhookTableMissing && status === "green") status = "yellow";

  const reason = reasons.length > 0 ? reasons.join("; ") : "All systems OK";

  return NextResponse.json(
    {
      status,
      reason,
      timestamp,
    },
    { status: 200 }
  );
}
