"use client";

import { useEffect, useState } from "react";

type SubscriptionRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
};

type Summary = {
  total: number;
  active: number;
  trialing: number;
  past_due: number;
  canceled: number;
  expired: number;
};

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    active: 0,
    trialing: 0,
    past_due: 0,
    canceled: 0,
    expired: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch("/api/admin/subscriptions");
      const result = (await response.json().catch(() => ({}))) as {
        subscriptions?: SubscriptionRow[];
        summary?: Summary;
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Failed to load subscriptions");
        setLoading(false);
        return;
      }
      setRows(result.subscriptions ?? []);
      if (result.summary) setSummary(result.summary);
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Subscription Status</h2>
      <p style={{ marginTop: 6 }}>
        <a href="/api/admin/subscriptions/export" style={{ textDecoration: "underline" }}>
          Download CSV export
        </a>
      </p>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {!loading ? (
        <p>
          Total: <strong>{summary.total}</strong> | Active: <strong>{summary.active}</strong> |
          Trialing: <strong>{summary.trialing}</strong> | Past due: <strong>{summary.past_due}</strong>{" "}
          | Canceled: <strong>{summary.canceled}</strong> | Expired: <strong>{summary.expired}</strong>
        </p>
      ) : null}
      {!loading && rows.length === 0 ? <p>No subscriptions found.</p> : null}
      {!loading && rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 1100, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Status</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Subscriber</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Current Period End</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Canceled At</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Stripe Sub</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.status}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    <code>{row.creator_id}</code>
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    <code>{row.subscriber_id}</code>
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
    </section>
  );
}

