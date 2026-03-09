import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import PremiumCard from "@/components/PremiumCard";
import BillingPortalButton from "./BillingPortalButton";
import { getPlanKeyForStripePriceId } from "@/lib/plan-entitlements";

type BillingSubscriptionRow = {
  id: string;
  creator_id: string;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
};

function statusBadge(status: string) {
  const color =
    status === "active"
      ? "#0a7f3f"
      : status === "trialing"
        ? "#2f5ec4"
        : status === "past_due"
          ? "#b26a00"
          : status === "canceled"
            ? "#8b1e1e"
            : "#555";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 8px",
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.2,
      }}
    >
      {status}
    </span>
  );
}

export default async function BillingPage() {
  const session = await createClient();
  const admin = getSupabaseAdmin();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/billing");
  }

  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "id, creator_id, status, current_period_end, canceled_at, created_at, stripe_subscription_id, stripe_price_id"
    )
    .eq("subscriber_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as BillingSubscriptionRow[];
  const latest = rows[0] ?? null;
  const planKey = getPlanKeyForStripePriceId(latest?.stripe_price_id ?? null);
  const planName =
    planKey === "starter"
      ? "Starter"
      : planKey === "professional"
        ? "Growth"
        : planKey === "elite"
          ? "Scale"
          : "No active plan";
  const allowanceSummary =
    planKey === "starter"
      ? "Includes 45 photos and 5 videos per month"
      : planKey === "professional"
        ? "Includes 90 photos and 15 videos per month"
        : planKey === "elite"
          ? "Includes 200 photos and 35 videos per month"
          : "No monthly allowance available";
  const renewalLabel = latest?.current_period_end
    ? `Renews ${new Date(latest.current_period_end).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : "Renewal date unavailable";
  const activeCount = rows.filter((s) => s.status === "active").length;
  const trialingCount = rows.filter((s) => s.status === "trialing").length;
  const pastDueCount = rows.filter((s) => s.status === "past_due").length;

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <PremiumCard>
        <h1 style={{ marginTop: 0, fontSize: 34, letterSpacing: "-0.02em" }}>Account & Billing</h1>
        <p className="section-copy" style={{ marginTop: 8 }}>
          Review your current plan, renewal date, and billing controls.
        </p>
        {!error ? (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 16,
              border: "1px solid var(--line)",
              background: "rgba(255,255,255,0.74)",
            }}
          >
            <p style={{ margin: 0, opacity: 0.75 }}>Your current plan</p>
            <h2 style={{ margin: "6px 0 6px", fontSize: 24 }}>{planName}</h2>
            <p style={{ margin: "0 0 4px", opacity: 0.82 }}>{renewalLabel}</p>
            <p style={{ margin: 0, opacity: 0.82 }}>{allowanceSummary}</p>
          </div>
        ) : null}
        {!error ? (
          <div className="feature-grid" style={{ marginTop: 16 }}>
            <PremiumCard title="Active" subtitle={`${activeCount} subscription(s)`} />
            <PremiumCard title="Trialing" subtitle={`${trialingCount} subscription(s)`} />
            <PremiumCard title="Past Due" subtitle={`${pastDueCount} subscription(s)`} />
          </div>
        ) : null}
      </PremiumCard>

      {error ? <p style={{ color: "var(--danger)" }}>{error.message}</p> : null}
      {!error && rows.length === 0 ? (
        <PremiumCard style={{ marginTop: 14 }}>
          <p>
            No subscriptions yet. <Link href="/creators">Browse creators</Link> to start.
          </p>
        </PremiumCard>
      ) : null}
      {!error && rows.length > 0 ? (
        <PremiumCard style={{ marginTop: 14 }}>
          <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", minWidth: 920 }}>
            <thead>
              <tr>
                <th>Status</th>
                <th>Creator</th>
                <th>Current Period End</th>
                <th>Canceled At</th>
                <th>Stripe Sub</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {statusBadge(row.status)}
                  </td>
                  <td>
                    <Link href={`/feed/creator/${row.creator_id}`}>
                      <code>{row.creator_id}</code>
                    </Link>
                  </td>
                  <td>
                    {row.current_period_end ? new Date(row.current_period_end).toLocaleString() : "—"}
                  </td>
                  <td>
                    {row.canceled_at ? new Date(row.canceled_at).toLocaleString() : "—"}
                  </td>
                  <td>
                    {row.stripe_subscription_id ?? "—"}
                  </td>
                  <td>
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </PremiumCard>
      ) : null}
      {!error ? (
        <PremiumCard style={{ marginTop: 14 }}>
          <BillingPortalButton />
          <p style={{ marginTop: 14 }}>Use billing settings to update your payment method, invoices, and subscription details.</p>
        </PremiumCard>
      ) : null}
    </main>
  );
}

