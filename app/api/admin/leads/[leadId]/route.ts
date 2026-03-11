import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";

type Params = { params: Promise<{ leadId: string }> };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isAdminUser(user.id, user.email)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { leadId } = await params;
  const admin = getSupabaseAdmin();
  const body = (await request.json().catch(() => ({}))) as {
    email?: string | null;
    source?: string;
    handle?: string;
    platform?: string;
    status?: string;
    profile_url?: string | null;
    notes?: string | null;
    follower_count?: number;
  };
  const patch: Record<string, unknown> = {};
  if (body.email !== undefined) patch.email = body.email?.trim().toLowerCase() || null;
  if (body.source !== undefined) patch.source = body.source.trim();
  if (body.handle !== undefined) patch.handle = body.handle.trim();
  if (body.platform !== undefined) patch.platform = body.platform.trim();
  if (body.status !== undefined) patch.status = body.status.trim().toLowerCase();
  if (body.profile_url !== undefined) patch.profile_url = body.profile_url?.trim() || null;
  if (body.notes !== undefined) patch.notes = body.notes ?? null;
  if (body.follower_count !== undefined) patch.follower_count = Math.max(0, Number(body.follower_count) || 0);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }
  const { error } = await admin.from("leads").update(patch).eq("id", leadId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { leadId } = await params;
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("leads").delete().eq("id", leadId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 200 });
}

