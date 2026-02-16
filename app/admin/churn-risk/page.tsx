"use client";

import { useEffect, useState } from "react";

type RiskRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  status: string;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
};

type Summary = {
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
};

export default function AdminChurnRiskPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [highRisk, setHighRisk] = useState<RiskRow[]>([]);
  const [mediumRisk, setMediumRisk] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch("/api/admin/churn-risk");
      const result = (await response.json().catch(() => ({}))) as {
        summary?: Summary;
        highRisk?: RiskRow[];
        mediumRisk?: RiskRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Failed to load churn risk");
        setLoading(false);
        return;
      }
      setSummary(result.summary ?? null);
      setHighRisk(result.highRisk ?? []);
      setMediumRisk(result.mediumRisk ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Churn Risk</h2>
      <p>Prioritize recovery on accounts most likely to churn.</p>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {!loading && !error && summary ? (
        <p>
          High risk (past_due): <strong>{summary.highRisk}</strong> | Medium risk (expiring ≤7d):{" "}
          <strong>{summary.mediumRisk}</strong> | Low risk (future canceled):{" "}
          <strong>{summary.lowRisk}</strong>
        </p>
      ) : null}

      {!loading && !error && highRisk.length > 0 ? (
        <>
          <h3>High Risk (Past Due)</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 1000, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Subscriber</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Period End</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Stripe Sub</th>
                </tr>
              </thead>
              <tbody>
                {highRisk.map((row) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {!loading && !error && mediumRisk.length > 0 ? (
        <>
          <h3 style={{ marginTop: 14 }}>Medium Risk (Expiring in 7 days)</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 1000, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Subscriber</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Period End</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {mediumRisk.map((row) => (
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
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}

