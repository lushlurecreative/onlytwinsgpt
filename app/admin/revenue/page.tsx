"use client";

import { useEffect, useState } from "react";

type RevenueResponse = {
  summary?: {
    activeSubscribers: number;
    revenueThisMonth: number;
    newThisMonth: number;
    canceledThisMonth: number;
  };
  subscriptionList?: { creator: string; plan: string; status: string; renewalDate: string }[];
  error?: string;
};

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueResponse>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch("/api/admin/revenue");
      const result = (await response.json().catch(() => ({}))) as RevenueResponse;
      if (!response.ok) {
        setError(result.error ?? "Failed to load revenue");
        setLoading(false);
        return;
      }
      setData(result);
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Revenue</h2>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {!loading && !error && data.summary ? (
        <>
          <div style={{ display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" }}>
            <span>Active Subscribers: <strong>{data.summary.activeSubscribers}</strong></span>
            <span>Revenue This Month: <strong>${data.summary.revenueThisMonth.toFixed(2)}</strong></span>
            <span>New This Month: <strong>{data.summary.newThisMonth}</strong></span>
            <span>Canceled This Month: <strong>{data.summary.canceledThisMonth}</strong></span>
          </div>

          <h3 style={{ marginBottom: 8 }}>Subscription list</h3>
          {(data.subscriptionList ?? []).length === 0 ? (
            <p className="muted">No subscriptions.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Plan</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Status</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Renewal Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.subscriptionList ?? []).map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.creator}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.plan}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.status}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.renewalDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

