import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { getServiceCreatorId } from "@/lib/service-creator";

type BillingStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "needs_review" | "expired";

function normalizeStatus(value: string): BillingStatus {
  const status = value.trim().toLowerCase();
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due") return "past_due";
  if (status === "canceled") return "canceled";
  if (status === "incomplete") return "incomplete";
  if (status === "expired") return "expired";
  return "needs_review";
}

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

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const statusFilter = url.searchParams.get("status")?.trim().toLowerCase() ?? "all";
  const serviceCreatorId = getServiceCreatorId();
  const admin = getSupabaseAdmin();

  const { data: subs, error: subsError } = await admin
    .from("subscriptions")
    .select("id, creator_id, subscriber_id, status, stripe_price_id, stripe_subscription_id, current_period_end, created_at, canceled_at, admin_notes, archived_at")
    .eq("creator_id", serviceCreatorId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (subsError) {
    return NextResponse.json({ error: subsError.message }, { status: 400 });
  }

  const rows = (subs ?? []) as {
    id: string;
    creator_id: string;
    subscriber_id: string;
    status: string;
    stripe_price_id: string | null;
    stripe_subscription_id: string | null;
    current_period_end: string | null;
    created_at: string;
    canceled_at: string | null;
    admin_notes: string | null;
    archived_at: string | null;
  }[];

  const subscriberIds = [...new Set(rows.map((r) => r.subscriber_id))];
  const profileMap = new Map<string, { full_name?: string | null; stripe_customer_id?: string | null }>();
  const emailMap = new Map<string, string | null>();

  if (subscriberIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, stripe_customer_id")
      .in("id", subscriberIds);
    for (const p of profiles ?? []) {
      const row = p as { id: string; full_name?: string | null; stripe_customer_id?: string | null };
      profileMap.set(row.id, { full_name: row.full_name, stripe_customer_id: row.stripe_customer_id });
    }
    try {
      const { data } = await admin.auth.admin.listUsers({ perPage: 500 });
      for (const u of data?.users ?? []) {
        if (subscriberIds.includes(u.id)) {
          emailMap.set(u.id, u.email ?? null);
        }
      }
    } catch {
      // ignore auth admin listing failures
    }
  }

  const modelStatusByUser = new Map<string, string>();
  const usageByUser = new Map<string, number>();
  const lastActivityByUser = new Map<string, string>();

  if (subscriberIds.length > 0) {
    const { data: subjects } = await admin
      .from("subjects")
      .select("id, user_id")
      .in("user_id", subscriberIds);
    const subjectIds = (subjects ?? []).map((s) => (s as { id: string }).id);
    const subjectByUserId = new Map<string, string>();
    for (const s of subjects ?? []) {
      const row = s as { id: string; user_id: string };
      subjectByUserId.set(row.user_id, row.id);
    }
    if (subjectIds.length > 0) {
      const { data: models } = await admin
        .from("subjects_models")
        .select("subject_id, training_status")
        .in("subject_id", subjectIds);
      for (const m of models ?? []) {
        const row = m as { subject_id: string; training_status: string };
        const uid = [...subjectByUserId.entries()].find(([, sid]) => sid === row.subject_id)?.[0];
        if (uid) {
          const label =
            row.training_status === "completed"
              ? "Trained"
              : row.training_status === "training"
                ? "Training"
                : row.training_status === "failed"
                  ? "Failed"
                  : "Not Trained";
          modelStatusByUser.set(uid, label);
        }
      }
    }
    const { data: genReqs } = await admin
      .from("generation_requests")
      .select("user_id, updated_at")
      .in("user_id", subscriberIds)
      .order("updated_at", { ascending: false });
    for (const g of genReqs ?? []) {
      const row = g as { user_id: string; updated_at: string };
      if (!usageByUser.has(row.user_id)) usageByUser.set(row.user_id, 0);
      usageByUser.set(row.user_id, (usageByUser.get(row.user_id) ?? 0) + 1);
      if (!lastActivityByUser.has(row.user_id))
        lastActivityByUser.set(row.user_id, row.updated_at);
    }
  }

  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const activeStatuses = ["active", "trialing", "past_due"];

  const summary = {
    activeCustomers: rows.filter((r) => activeStatuses.includes(r.status)).length,
    newThisWeek: rows.filter((r) => new Date(r.created_at).getTime() >= oneWeekAgo).length,
    canceledThisWeek: rows.filter(
      (r) => r.canceled_at && new Date(r.canceled_at).getTime() >= oneWeekAgo
    ).length,
  };

  const list = rows.map((r) => {
    const profile = profileMap.get(r.subscriber_id);
    const displayName =
      (profile?.full_name && profile.full_name.trim()) || r.subscriber_id.slice(0, 8) + "…";
    const normalizedStatus = normalizeStatus(r.status);
    const statusLabel =
      normalizedStatus === "trialing"
        ? "Trial"
        : normalizedStatus === "active"
          ? "Active"
          : normalizedStatus === "past_due"
            ? "Past Due"
            : normalizedStatus === "canceled"
              ? "Canceled"
              : normalizedStatus === "incomplete"
                ? "Incomplete"
                : normalizedStatus === "needs_review"
                  ? "Needs review"
                  : "Expired";
    const planLabel = r.stripe_price_id ?? "manual";
    const usage = usageByUser.get(r.subscriber_id) ?? 0;
    const modelStatus = modelStatusByUser.get(r.subscriber_id) ?? "Not Trained";
    const lastActivity =
      lastActivityByUser.get(r.subscriber_id) ?? r.created_at;
    return {
      id: r.id,
      workspaceId: r.subscriber_id,
      email: emailMap.get(r.subscriber_id) ?? null,
      creator: displayName,
      creatorId: r.creator_id,
      plan: planLabel,
      stripePriceId: r.stripe_price_id,
      stripeCustomerId: (profile as { stripe_customer_id?: string | null } | undefined)?.stripe_customer_id ?? null,
      stripeSubscriptionId: r.stripe_subscription_id,
      status: statusLabel,
      rawStatus: normalizedStatus,
      renewalDate: r.current_period_end,
      createdAt: r.created_at,
      canceledAt: r.canceled_at,
      usage,
      modelStatus,
      lastActivity,
      adminNotes: r.admin_notes ?? null,
    };
  });
  const filteredList = list.filter((row) => {
    if (statusFilter !== "all" && row.rawStatus !== statusFilter) return false;
    if (!q) return true;
    const haystack = [
      row.email ?? "",
      row.creator ?? "",
      row.workspaceId,
      row.plan ?? "",
      row.status ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  let recentAccounts: Array<{ id: string; email: string | null; created_at: string; isCustomer: boolean }> = [];
  try {
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    const customerIds = new Set(list.map((row) => row.workspaceId));
    recentAccounts = (data?.users ?? [])
      .map((u) => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at ?? new Date().toISOString(),
        isCustomer: customerIds.has(u.id),
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 100);
  } catch {
    // ignore
  }

  return NextResponse.json({ customers: filteredList, summary, recentAccounts }, { status: 200 });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  const serviceCreatorId = getServiceCreatorId();
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    plan?: string | null;
    status?: string;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    renewalDate?: string | null;
    adminNotes?: string | null;
  };

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const found = (data?.users ?? []).find((u) => (u.email ?? "").trim().toLowerCase() === email);
  if (!found?.id) {
    return NextResponse.json({ error: "No account found for that email." }, { status: 404 });
  }
  const subscriberId = found.id;
  const status = normalizeStatus(body.status ?? "active");

  if (body.stripeCustomerId?.trim()) {
    await admin.from("profiles").upsert(
      {
        id: subscriberId,
        stripe_customer_id: body.stripeCustomerId.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  }

  const { data: sub, error } = await admin
    .from("subscriptions")
    .upsert(
      {
        creator_id: serviceCreatorId,
        subscriber_id: subscriberId,
        status,
        stripe_price_id: body.plan?.trim() || null,
        stripe_subscription_id: body.stripeSubscriptionId?.trim() || null,
        current_period_end: body.renewalDate ?? null,
        canceled_at: status === "canceled" ? new Date().toISOString() : null,
        admin_notes: body.adminNotes ?? null,
      },
      { onConflict: "creator_id,subscriber_id" }
    )
    .select("id, subscriber_id")
    .single();

  if (error || !sub) {
    return NextResponse.json({ error: error?.message ?? "Failed to create customer." }, { status: 400 });
  }
  return NextResponse.json({ customer: sub }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  const body = (await request.json().catch(() => ({}))) as {
    subscriptionId?: string;
    subscriberId?: string;
    plan?: string | null;
    status?: string;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    renewalDate?: string | null;
    adminNotes?: string | null;
    fullName?: string | null;
  };
  const subscriptionId = body.subscriptionId?.trim() || "";
  const subscriberId = body.subscriberId?.trim() || "";
  if (!subscriptionId && !subscriberId) {
    return NextResponse.json({ error: "subscriptionId or subscriberId is required." }, { status: 400 });
  }

  const subPatch: Record<string, unknown> = {};
  if (body.plan !== undefined) subPatch.stripe_price_id = body.plan?.trim() || null;
  if (body.status !== undefined) {
    const normalized = normalizeStatus(body.status);
    subPatch.status = normalized;
    if (normalized === "canceled") subPatch.canceled_at = new Date().toISOString();
    if (normalized === "active" || normalized === "trialing") subPatch.canceled_at = null;
  }
  if (body.stripeSubscriptionId !== undefined) subPatch.stripe_subscription_id = body.stripeSubscriptionId?.trim() || null;
  if (body.renewalDate !== undefined) subPatch.current_period_end = body.renewalDate || null;
  if (body.adminNotes !== undefined) subPatch.admin_notes = body.adminNotes ?? null;

  let q = admin.from("subscriptions").update(subPatch);
  if (subscriptionId) q = q.eq("id", subscriptionId);
  else q = q.eq("subscriber_id", subscriberId).is("archived_at", null);
  const { data: updated, error } = await q.select("id, subscriber_id").limit(1).maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const targetSubscriberId = subscriberId || (updated as { subscriber_id?: string } | null)?.subscriber_id || "";
  if (targetSubscriberId) {
    const profilePatch: Record<string, unknown> = {};
    if (body.stripeCustomerId !== undefined) profilePatch.stripe_customer_id = body.stripeCustomerId?.trim() || null;
    if (body.fullName !== undefined) profilePatch.full_name = body.fullName?.trim() || null;
    if (Object.keys(profilePatch).length > 0) {
      profilePatch.updated_at = new Date().toISOString();
      await admin.from("profiles").upsert({ id: targetSubscriberId, ...profilePatch }, { onConflict: "id" });
    }
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  const body = (await request.json().catch(() => ({}))) as {
    subscriptionId?: string;
    subscriberId?: string;
    confirmText?: string;
  };
  if ((body.confirmText ?? "").trim().toUpperCase() !== "ARCHIVE") {
    return NextResponse.json({ error: "Confirmation text ARCHIVE is required." }, { status: 400 });
  }
  const subscriptionId = body.subscriptionId?.trim() || "";
  const subscriberId = body.subscriberId?.trim() || "";
  if (!subscriptionId && !subscriberId) {
    return NextResponse.json({ error: "subscriptionId or subscriberId is required." }, { status: 400 });
  }
  let q = admin.from("subscriptions").update({
    status: "canceled",
    canceled_at: new Date().toISOString(),
    archived_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (subscriptionId) q = q.eq("id", subscriptionId);
  else q = q.eq("subscriber_id", subscriberId).is("archived_at", null);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
