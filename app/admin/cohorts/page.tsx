"use client";

import { useEffect, useState } from "react";

type CohortRow = {
  month: string;
  started: number;
  retainedNow: number;
  retentionRate: number;
};

export default function AdminCohortsPage() {
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch("/api/admin/cohorts");
      const result = (await response.json().catch(() => ({}))) as {
        cohorts?: CohortRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Failed to load cohorts");
        setLoading(false);
        return;
      }
      setRows(result.cohorts ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Subscriber Cohorts</h2>
      <p>Retention snapshot by subscription start month.</p>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {!loading && !error && rows.length === 0 ? <p>No cohort data found.</p> : null}
      {!loading && !error && rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 760, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Month</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Started</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Retained now</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Retention</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.month}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.started}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.retainedNow}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    <strong>{row.retentionRate}%</strong>
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

