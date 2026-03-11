import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { getServiceCreatorId } from "@/lib/service-creator";

type Params = { params: Promise<{ workspaceId: string }> };

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

function normalizeStatus(value: string) {
  const status = value.trim().toLowerCase();
  if (["active", "trialing", "past_due", "canceled", "incomplete", "expired"].includes(status)) return status;
  return "needs_review";
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { workspaceId } = await params;
  const admin = getSupabaseAdmin();
  const serviceCreatorId = getServiceCreatorId();
  const body = (await request.json().catch(() => ({}))) as {
    fullName?: string | null;
    status?: string;
    stripePriceId?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    currentPeriodEnd?: string | null;
    adminNotes?: string | null;
  };

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const normalized = normalizeStatus(body.status);
    patch.status = normalized;
    if (normalized === "canceled") patch.canceled_at = new Date().toISOString();
    if (normalized === "active" || normalized === "trialing") patch.canceled_at = null;
  }
  if (body.stripePriceId !== undefined) patch.stripe_price_id = body.stripePriceId?.trim() || null;
  if (body.stripeSubscriptionId !== undefined) patch.stripe_subscription_id = body.stripeSubscriptionId?.trim() || null;
  if (body.currentPeriodEnd !== undefined) patch.current_period_end = body.currentPeriodEnd || null;
  if (body.adminNotes !== undefined) patch.admin_notes = body.adminNotes ?? null;

  if (Object.keys(patch).length > 0) {
    const { error: subError } = await admin
      .from("subscriptions")
      .update(patch)
      .eq("creator_id", serviceCreatorId)
      .eq("subscriber_id", workspaceId)
      .is("archived_at", null);
    if (subError) {
      return NextResponse.json({ error: subError.message }, { status: 400 });
    }
  }

  const profilePatch: Record<string, unknown> = {};
  if (body.fullName !== undefined) profilePatch.full_name = body.fullName?.trim() || null;
  if (body.stripeCustomerId !== undefined) profilePatch.stripe_customer_id = body.stripeCustomerId?.trim() || null;
  if (Object.keys(profilePatch).length > 0) {
    profilePatch.updated_at = new Date().toISOString();
    const { error: profileError } = await admin.from("profiles").upsert({ id: workspaceId, ...profilePatch }, { onConflict: "id" });
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { workspaceId } = await params;
  const admin = getSupabaseAdmin();
  const serviceCreatorId = getServiceCreatorId();
  const body = (await request.json().catch(() => ({}))) as { confirmText?: string };
  if ((body.confirmText ?? "").trim().toUpperCase() !== "ARCHIVE") {
    return NextResponse.json({ error: "Confirmation text ARCHIVE is required." }, { status: 400 });
  }
  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("creator_id", serviceCreatorId)
    .eq("subscriber_id", workspaceId)
    .is("archived_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 200 });
}

