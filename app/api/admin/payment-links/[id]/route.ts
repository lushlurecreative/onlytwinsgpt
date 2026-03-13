import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { getServiceCreatorId } from "@/lib/service-creator";

type Params = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdminUser(user.id, user.email)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

/** GET: Return the payment link row (including checkout_url for copy/open). Admin only. */
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const serviceCreatorId = getServiceCreatorId();
  const { data, error } = await admin
    .from("admin_payment_links")
    .select("id, email, plan, checkout_url, full_name, admin_notes, created_at")
    .eq("id", id)
    .eq("creator_id", serviceCreatorId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Payment link not found." }, { status: 404 });
  }

  const row = data as { id: string; email: string; plan: string; checkout_url: string | null; full_name: string | null; admin_notes: string | null; created_at: string };
  return NextResponse.json({
    id: row.id,
    email: row.email,
    plan: row.plan,
    checkoutUrl: row.checkout_url,
    fullName: row.full_name,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
  });
}

/** DELETE: Remove a pending payment link record. Admin only. Does not cancel the Stripe session. */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const serviceCreatorId = getServiceCreatorId();
  const { error } = await admin
    .from("admin_payment_links")
    .delete()
    .eq("id", id)
    .eq("creator_id", serviceCreatorId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
