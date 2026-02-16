"use client";

import { useEffect, useState } from "react";

type CreatorKpiRow = {
  creatorId: string;
  totalPosts: number;
  publishedPosts: number;
  publicPosts: number;
  subscriberPosts: number;
  postsLast30d: number;
  activeLikeSubs: number;
  pastDueSubs: number;
  estMrr: number;
};

export default function AdminCreatorKpisPage() {
  const [rows, setRows] = useState<CreatorKpiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch("/api/admin/creator-kpis");
      const result = (await response.json().catch(() => ({}))) as {
        rows?: CreatorKpiRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Failed to load creator KPIs");
        setLoading(false);
        return;
      }
      setRows(result.rows ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Creator KPI Leaderboard</h2>
      <p>Cross-creator operating metrics for growth and revenue prioritization.</p>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {!loading && !error && rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 1200, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Est. MRR</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Active-like subs</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Past due</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Posts (30d)</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Published</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Public</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Subscriber-only</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.creatorId}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    <code>{row.creatorId}</code>
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>${row.estMrr.toFixed(2)}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.activeLikeSubs}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.pastDueSubs}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.postsLast30d}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.publishedPosts}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.publicPosts}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.subscriberPosts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

