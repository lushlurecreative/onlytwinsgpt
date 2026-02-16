import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import BillingPortalButton from "./BillingPortalButton";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/billing");
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, creator_id, status, current_period_end, canceled_at, created_at, stripe_subscription_id, stripe_price_id"
    )
    .eq("subscriber_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as BillingSubscriptionRow[];
  const activeCount = rows.filter((s) => s.status === "active").length;
  const trialingCount = rows.filter((s) => s.status === "trialing").length;
  const pastDueCount = rows.filter((s) => s.status === "past_due").length;

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Billing</h1>
      <p>Track your current and past creator subscriptions.</p>
      {!error ? (
        <p>
          Active: <strong>{activeCount}</strong> | Trialing: <strong>{trialingCount}</strong> |
          Past due: <strong>{pastDueCount}</strong>
        </p>
      ) : null}
      {error ? <p>❌ {error.message}</p> : null}
      {!error && rows.length === 0 ? (
        <p>
          No subscriptions yet. <Link href="/creators">Browse creators</Link> to start.
        </p>
      ) : null}
      {!error && rows.length > 0 ? (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 920 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Status</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Current Period End</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Canceled At</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Stripe Sub</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Started</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {statusBadge(row.status)}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    <Link href={`/feed/creator/${row.creator_id}`}>
                      <code>{row.creator_id}</code>
                    </Link>
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {row.current_period_end ? new Date(row.current_period_end).toLocaleString() : "—"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {row.canceled_at ? new Date(row.canceled_at).toLocaleString() : "—"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {row.stripe_subscription_id ?? "—"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!error ? <BillingPortalButton /> : null}
      <p style={{ marginTop: 14 }}>
        Need changes? Open Stripe checkout again from any creator feed to renew or re-subscribe.
      </p>
    </main>
  );
}

