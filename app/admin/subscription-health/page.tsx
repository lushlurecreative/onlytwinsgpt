"use client";

import { useEffect, useState } from "react";

type IssueRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
};

type Summary = {
  totalRows: number;
  issueRows: number;
  expiredWithFutureEnd: number;
  activeOrTrialingPastEnd: number;
  canceledWithFutureEnd: number;
};

export default function SubscriptionHealthPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch("/api/admin/subscription-health");
      const result = (await response.json().catch(() => ({}))) as {
        summary?: Summary;
        issues?: IssueRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Failed to load subscription health");
        setLoading(false);
        return;
      }
      setSummary(result.summary ?? null);
      setIssues(result.issues ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Subscription Health</h2>
      <p>Data quality checks for lifecycle-state mismatches.</p>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {!loading && !error && summary ? (
        <p>
          Total rows: <strong>{summary.totalRows}</strong> | Issues: <strong>{summary.issueRows}</strong>{" "}
          | Expired+future end: <strong>{summary.expiredWithFutureEnd}</strong> | Active/trialing+past
          end: <strong>{summary.activeOrTrialingPastEnd}</strong> | Canceled+future end:{" "}
          <strong>{summary.canceledWithFutureEnd}</strong>
        </p>
      ) : null}
      {!loading && !error && issues.length === 0 ? <p>No issue rows found.</p> : null}
      {!loading && !error && issues.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 1100, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Status</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Subscriber</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Period End</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Canceled At</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((row) => (
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

