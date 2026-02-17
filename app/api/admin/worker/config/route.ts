import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getRunPodConfig, getRunPodHealth } from "@/lib/runpod";

/** GET: Return RunPod config status (no secret values). Admin only. */
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

  const config = await getRunPodConfig();
  if (!config) {
    const admin = getSupabaseAdmin();
    const [apiKeyRes, endpointRes] = await Promise.all([
      admin.from("app_settings").select("value").eq("key", "runpod_api_key").maybeSingle(),
      admin.from("app_settings").select("value").eq("key", "runpod_endpoint_id").maybeSingle(),
    ]);
    const hasApiKey = !!(apiKeyRes.data?.value as string)?.trim();
    const endpointId = (endpointRes.data?.value as string)?.trim() || null;
    return NextResponse.json({
      configured: false,
      hasApiKey,
      endpointId,
      source: "db_or_env",
    });
  }

  const health = await getRunPodHealth(config);
  return NextResponse.json({
    configured: true,
    hasApiKey: true,
    endpointId: config.endpointId,
    source: process.env.RUNPOD_API_KEY ? "env" : "db",
    health,
  });
}

/** PUT: Set RunPod API key and/or endpoint ID in app_settings. Admin only. */
export async function PUT(request: Request) {
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

  let body: { runpod_api_key?: string; runpod_endpoint_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (body.runpod_api_key !== undefined) {
    await admin
      .from("app_settings")
      .upsert(
        { key: "runpod_api_key", value: String(body.runpod_api_key).trim(), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
  }
  if (body.runpod_endpoint_id !== undefined) {
    await admin
      .from("app_settings")
      .upsert(
        { key: "runpod_endpoint_id", value: String(body.runpod_endpoint_id).trim(), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
  }
  return NextResponse.json({ ok: true });
}
