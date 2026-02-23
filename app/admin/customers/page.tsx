import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getServiceCreatorId } from "@/lib/service-creator";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type SubRow = {
  id: string;
  subscriber_id: string;
  status: string;
  stripe_price_id: string | null;
  current_period_end: string | null;
  created_at: string;
  canceled_at: string | null;
};

export default async function AdminCustomersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/customers");
  }
  if (!isAdminUser(user.id)) {
    return <p>❌ Access denied. Add your user ID to ADMIN_USER_IDS.</p>;
  }

  const serviceCreatorId = getServiceCreatorId();
  const { data: subs, error: subsError } = await supabase
    .from("subscriptions")
    .select("id, subscriber_id, status, stripe_price_id, current_period_end, created_at, canceled_at")
    .eq("creator_id", serviceCreatorId)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (subsError) {
    return <p>❌ {subsError.message}</p>;
  }

  const rows = (subs ?? []) as SubRow[];
  const subscriberIds = [...new Set(rows.map((r) => r.subscriber_id))];

  const profileMap = new Map<string, string>();
  if (subscriberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", subscriberIds);
    for (const p of profiles ?? []) {
      const row = p as { id: string; full_name?: string | null };
      profileMap.set(row.id, (row.full_name && row.full_name.trim()) || row.id.slice(0, 8) + "…");
    }
  }

  const modelStatusByUser = new Map<string, string>();
  const usageByUser = new Map<string, number>();
  if (subscriberIds.length > 0) {
    const { data: subjects } = await supabase
      .from("subjects")
      .select("id, user_id")
      .in("user_id", subscriberIds);
    const subjectByUserId = new Map<string, string>();
    const subjectIds: string[] = [];
    for (const s of subjects ?? []) {
      const row = s as { id: string; user_id: string };
      subjectByUserId.set(row.user_id, row.id);
      subjectIds.push(row.id);
    }
    if (subjectIds.length > 0) {
      const { data: models } = await supabase
        .from("subjects_models")
        .select("subject_id, training_status")
        .in("subject_id", subjectIds);
      for (const m of models ?? []) {
        const row = m as { subject_id: string; training_status: string };
        const uid = [...subjectByUserId.entries()].find(([, sid]) => sid === row.subject_id)?.[0];
        if (uid)
          modelStatusByUser.set(
            uid,
            row.training_status === "completed"
              ? "Trained"
              : row.training_status === "training"
                ? "Training"
                : row.training_status === "failed"
                  ? "Failed"
                  : "Not Trained"
          );
      }
    }
    const { data: genReqs } = await supabase
      .from("generation_requests")
      .select("user_id")
      .in("user_id", subscriberIds);
    for (const g of genReqs ?? []) {
      const uid = (g as { user_id: string }).user_id;
      usageByUser.set(uid, (usageByUser.get(uid) ?? 0) + 1);
    }
  }

  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const activeStatuses = ["active", "trialing", "past_due"];
  const subscriberIdSet = new Set(subscriberIds);
  const summary = {
    activeCustomers: rows.filter((r) => activeStatuses.includes(r.status)).length,
    newThisWeek: rows.filter((r) => new Date(r.created_at).getTime() >= oneWeekAgo).length,
    canceledThisWeek: rows.filter(
      (r) => r.canceled_at && new Date(r.canceled_at).getTime() >= oneWeekAgo
    ).length,
  };

  let recentAccounts: { id: string; email: string | null; created_at: string; isSubscriber: boolean }[] = [];
  try {
    const admin = getSupabaseAdmin();
    const { data: authData } = await admin.auth.admin.listUsers({ perPage: 100 });
    const users = authData?.users ?? [];
    recentAccounts = users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at ?? new Date().toISOString(),
      isSubscriber: subscriberIdSet.has(u.id),
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch {
    // If service role is missing or auth admin fails, show only subscribers
  }

  const statusLabel = (s: string) =>
    s === "trialing"
      ? "Trial"
      : s === "active"
        ? "Active"
        : s === "past_due"
          ? "Past Due"
          : s === "canceled"
            ? "Canceled"
            : s === "expired"
              ? "Expired"
              : s;

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Customers</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
        Subscribers (below) appear after Stripe webhook. Recent sign-ups appear in the list above; they show as &quot;Not yet subscribed&quot; until they complete checkout.
      </p>
      <div style={{ display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" }}>
        <span>Active Customers: <strong>{summary.activeCustomers}</strong></span>
        <span>New This Week: <strong>{summary.newThisWeek}</strong></span>
        <span>Canceled This Week: <strong>{summary.canceledThisWeek}</strong></span>
      </div>

      {recentAccounts.length > 0 && (
        <>
          <h3 style={{ marginTop: 24, marginBottom: 8 }}>Recent accounts</h3>
          <div style={{ overflowX: "auto", marginBottom: 24 }}>
            <table style={{ borderCollapse: "collapse", minWidth: 520, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Email</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Signed up</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Status</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentAccounts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{a.email ?? a.id.slice(0, 8) + "…"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{new Date(a.created_at).toLocaleString()}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{a.isSubscriber ? "Subscriber" : "Not yet subscribed"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                      <Link href={`/admin/customers/${a.id}`}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 style={{ marginTop: 0, marginBottom: 8 }}>Subscribers</h3>
      {rows.length === 0 ? (
        <p>No subscribers yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 860, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Plan</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Status</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Usage</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Model Status</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Last Activity</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {profileMap.get(r.subscriber_id) ?? r.subscriber_id.slice(0, 8) + "…"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {r.stripe_price_id ? "Subscription" : "—"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{statusLabel(r.status)}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {usageByUser.get(r.subscriber_id) ?? 0}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {modelStatusByUser.get(r.subscriber_id) ?? "Not Trained"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    <Link href={`/admin/customers/${r.subscriber_id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
