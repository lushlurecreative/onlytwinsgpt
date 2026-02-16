"use client";

import { useEffect, useMemo, useState } from "react";

type DailyRow = {
  date: string;
  newPosts: number;
  newPublishedPosts: number;
  newSubscriptions: number;
  newPastDue: number;
};

export default function AdminKpisPage() {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch("/api/admin/kpis");
      const result = (await response.json().catch(() => ({}))) as {
        daily?: DailyRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Failed to load KPIs");
        setLoading(false);
        return;
      }
      setRows(result.daily ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.newPosts += row.newPosts;
        acc.newPublishedPosts += row.newPublishedPosts;
        acc.newSubscriptions += row.newSubscriptions;
        acc.newPastDue += row.newPastDue;
        return acc;
      },
      { newPosts: 0, newPublishedPosts: 0, newSubscriptions: 0, newPastDue: 0 }
    );
  }, [rows]);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>30-Day KPI Monitor</h2>
      <p>Daily operational trend for content and subscription pipeline.</p>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {!loading && !error ? (
        <p>
          30-day totals — Posts: <strong>{totals.newPosts}</strong>, Published:{" "}
          <strong>{totals.newPublishedPosts}</strong>, New subscriptions:{" "}
          <strong>{totals.newSubscriptions}</strong>, New past_due: <strong>{totals.newPastDue}</strong>
        </p>
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 820, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Date</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>New posts</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Published posts</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>New subs</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>New past_due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.date}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.newPosts}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.newPublishedPosts}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.newSubscriptions}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.newPastDue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

