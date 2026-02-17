import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";

type Params = { params: Promise<{ subjectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subjectId } = await params;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("subjects")
    .select("id, user_id, label, consent_status, consent_signed_at, identity_verified_at, created_at, updated_at")
    .eq("id", subjectId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }
  if ((data as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ subject: data }, { status: 200 });
}

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subjectId } = await params;
  const admin = getSupabaseAdmin();
  const { data: existing, error: fetchError } = await admin
    .from("subjects")
    .select("id, user_id")
    .eq("id", subjectId)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }
  const row = existing as { user_id: string };
  if (row.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    label?: string | null;
    consent_status?: "pending" | "approved" | "revoked";
    consent_signed_at?: string | null;
    identity_verified_at?: string | null;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.label !== undefined) updates.label = body.label?.trim() ?? null;

  const isAdmin = isAdminUser(user.id);
  if (isAdmin) {
    if (body.consent_status !== undefined) updates.consent_status = body.consent_status;
    if (body.consent_signed_at !== undefined) updates.consent_signed_at = body.consent_signed_at;
    if (body.identity_verified_at !== undefined) updates.identity_verified_at = body.identity_verified_at;
  }

  updates.updated_at = new Date().toISOString();
  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "No updates" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await admin
    .from("subjects")
    .update(updates)
    .eq("id", subjectId)
    .select("id, user_id, label, consent_status, consent_signed_at, identity_verified_at, updated_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }
  return NextResponse.json({ subject: updated }, { status: 200 });
}
