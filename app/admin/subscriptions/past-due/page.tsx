"use client";

import { useEffect, useState } from "react";

type PastDueRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
  stripe_subscription_id: string | null;
};

export default function AdminPastDueSubscriptionsPage() {
  const [rows, setRows] = useState<PastDueRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch("/api/admin/subscriptions/past-due");
      const result = (await response.json().catch(() => ({}))) as {
        count?: number;
        rows?: PastDueRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Failed to load past-due subscriptions");
        setLoading(false);
        return;
      }
      setRows(result.rows ?? []);
      setCount(result.count ?? 0);
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Past-Due Subscriptions</h2>
      <p>Users who failed payment and need recovery/retry workflows.</p>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {!loading && !error ? (
        <p>
          Current past-due rows: <strong>{count}</strong>
        </p>
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 1100, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Subscriber</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Period End</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Stripe Sub</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
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

