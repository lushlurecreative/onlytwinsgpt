import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";

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

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("admin_referral_links")
    .select("id, code, label, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ links: data ?? [] }, { status: 200 });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin();

  const body = (await request.json().catch(() => ({}))) as { label?: string };
  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: "Label is required." }, { status: 400 });

  // Generate unique code
  let code = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateCode();
    const { data: existing } = await admin
      .from("admin_referral_links")
      .select("id")
      .eq("code", candidate)
      .maybeSingle();
    if (!existing) { code = candidate; break; }
  }
  if (!code) return NextResponse.json({ error: "Could not generate unique code." }, { status: 500 });

  const { data, error } = await admin
    .from("admin_referral_links")
    .insert({ code, label })
    .select("id, code, label, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ link: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin();

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await admin.from("admin_referral_links").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
