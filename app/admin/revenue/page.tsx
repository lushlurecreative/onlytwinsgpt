"use client";

import { useEffect, useState } from "react";

type RevenueResponse = {
  summary?: { activeLikeCount: number; estMrr: number };
  topCreators?: { creatorId: string; subscribers: number; estMrr: number }[];
  monthly?: { month: string; started: number; activeNow: number; retainedPct: number }[];
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
      <h2 style={{ marginTop: 0 }}>Revenue Intelligence</h2>
      <p>Estimated subscription revenue and creator performance ranking.</p>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {!loading && !error && data.summary ? (
        <p>
          Active-like subscriptions: <strong>{data.summary.activeLikeCount}</strong> | Estimated MRR:{" "}
          <strong>${data.summary.estMrr.toFixed(2)}</strong>
        </p>
      ) : null}

      {!loading && !error && (data.topCreators ?? []).length > 0 ? (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 840 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Subscribers</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Est. MRR</th>
              </tr>
            </thead>
            <tbody>
              {(data.topCreators ?? []).map((row) => (
                <tr key={row.creatorId}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    <code>{row.creatorId}</code>
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.subscribers}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>${row.estMrr.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && !error && (data.monthly ?? []).length > 0 ? (
        <div style={{ overflowX: "auto", marginTop: 14 }}>
          <h3 style={{ marginBottom: 6 }}>12-Month Cohort Snapshot</h3>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Month</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Started</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Active now</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Retained %</th>
              </tr>
            </thead>
            <tbody>
              {(data.monthly ?? []).map((row) => (
                <tr key={row.month}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.month}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.started}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.activeNow}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.retainedPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

