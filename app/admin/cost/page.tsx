"use client";

import { useEffect, useState } from "react";

type ByType = Record<string, { count: number; duration_sec: number; cost_usd: number }>;
type CostResponse = {
  days?: number;
  by_type?: ByType;
  lead_sample_today_count?: number;
  lead_sample_spent_today_usd?: number;
  lead_sample_daily_budget_usd?: number;
  recent?: { job_type: string; job_id: string; duration_sec: number; cost_usd?: number | null; created_at: string }[];
  error?: string;
};

export default function AdminCostPage() {
  const [data, setData] = useState<CostResponse>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch("/api/admin/gpu-usage?days=30");
      const result = (await res.json().catch(() => ({}))) as CostResponse;
      if (!res.ok) {
        setError(result.error ?? "Failed to load");
        setLoading(false);
        return;
      }
      setData(result);
      setLoading(false);
    }
    void load();
  }, []);

  const byType = data.by_type ?? {};
  const budget = data.lead_sample_daily_budget_usd ?? 0;
  const spentToday = data.lead_sample_spent_today_usd ?? 0;

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>GPU usage & cost</h2>
      <p className="muted">Track worker GPU usage and lead_sample budget. Set lead_sample_daily_budget_usd in app_settings.</p>
      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}

      {!loading && !error && Object.keys(byType).length > 0 ? (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>By job type (last {data.days ?? 30} days)</h3>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Type</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #333", padding: 8 }}>Count</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #333", padding: 8 }}>Duration (sec)</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #333", padding: 8 }}>Cost (USD)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byType).map(([t, v]) => (
                  <tr key={t}>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{t}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222", textAlign: "right" }}>{v.count}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222", textAlign: "right" }}>
                      {v.duration_sec.toFixed(0)}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222", textAlign: "right" }}>
                      ${v.cost_usd.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>Lead sample budget (today)</h3>
            <p>
              Spent today: <strong>${spentToday.toFixed(4)}</strong>
              {budget > 0 ? (
                <> · Budget: ${budget.toFixed(2)} · {spentToday >= budget ? "Budget reached" : "Under budget"}</>
              ) : null}
            </p>
            <p className="muted" style={{ fontSize: 12 }}>
              Jobs today: {data.lead_sample_today_count ?? 0}. Set app_settings key lead_sample_daily_budget_usd to enforce a daily cap.
            </p>
          </div>
        </>
      ) : null}

      {!loading && !error && (data.recent ?? []).length > 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Recent usage (last 50)</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 6 }}>Time</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 6 }}>Type</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 6 }}>Job ID</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #333", padding: 6 }}>Duration</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #333", padding: 6 }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {(data.recent ?? []).map((r) => (
                  <tr key={r.created_at + r.job_id}>
                    <td style={{ padding: 6, borderBottom: "1px solid #222" }}>
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: 6, borderBottom: "1px solid #222" }}>{r.job_type}</td>
                    <td style={{ padding: 6, borderBottom: "1px solid #222", fontFamily: "monospace", fontSize: 11 }}>
                      {r.job_id?.slice(0, 8)}…
                    </td>
                    <td style={{ padding: 6, borderBottom: "1px solid #222", textAlign: "right" }}>
                      {Number(r.duration_sec).toFixed(0)}s
                    </td>
                    <td style={{ padding: 6, borderBottom: "1px solid #222", textAlign: "right" }}>
                      {r.cost_usd != null ? `$${Number(r.cost_usd).toFixed(4)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
