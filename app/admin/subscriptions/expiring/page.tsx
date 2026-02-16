"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";

type Row = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
  stripe_subscription_id: string | null;
};

export default function ExpiringSubscriptionsPage() {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);

  async function load(nextDays: number) {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/admin/subscriptions/expiring?days=${nextDays}`);
    const result = (await response.json().catch(() => ({}))) as {
      count?: number;
      rows?: Row[];
      error?: string;
    };
    if (!response.ok) {
      setError(result.error ?? "Failed to load expiring subscriptions");
      setLoading(false);
      return;
    }
    setCount(result.count ?? 0);
    setRows(result.rows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load(days);
  }, [days]);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Expiring Subscriptions</h2>
      <p>Operational list of subscribers approaching period end.</p>
      <div style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[3, 7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            disabled={days === d}
            style={{ padding: "6px 10px" }}
          >
            Next {d} days
          </button>
        ))}
      </div>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {!loading && !error ? (
        <p>
          Expiring within <strong>{days}</strong> days: <strong>{count}</strong>
        </p>
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 1080, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Status</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Subscriber</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Period End</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Stripe Sub</th>
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
                    {row.stripe_subscription_id ?? "—"}
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

