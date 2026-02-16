"use client";

import { useEffect, useState } from "react";

type Summary = {
  total: number;
  processed: number;
  pending: number;
  stalePendingOver10m: number;
  p95ProcessingSeconds: number;
};

type EventRow = {
  id: string;
  event_type: string;
  received_at: string;
  processed_at: string | null;
};

export default function WebhookHealthPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [eventTypeBreakdown, setEventTypeBreakdown] = useState<Record<string, number>>({});
  const [stalePending, setStalePending] = useState<EventRow[]>([]);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch("/api/admin/webhook-health");
      const result = (await response.json().catch(() => ({}))) as {
        summary?: Summary;
        eventTypeBreakdown?: Record<string, number>;
        stalePending?: EventRow[];
        warning?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Failed to load webhook health");
        setLoading(false);
        return;
      }
      setSummary(result.summary ?? null);
      setEventTypeBreakdown(result.eventTypeBreakdown ?? {});
      setStalePending(result.stalePending ?? []);
      setWarning(result.warning ?? "");
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Webhook Health</h2>
      <p>Delivery and processing health checks for Stripe events.</p>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {warning ? <p>⚠️ {warning}</p> : null}
      {!loading && !error && summary ? (
        <p>
          Total: <strong>{summary.total}</strong> | Processed: <strong>{summary.processed}</strong> |
          Pending: <strong>{summary.pending}</strong> | Stale pending {">"}10m:{" "}
          <strong>{summary.stalePendingOver10m}</strong> | p95 processing:{" "}
          <strong>{summary.p95ProcessingSeconds}s</strong>
        </p>
      ) : null}
      {!loading && !error && Object.keys(eventTypeBreakdown).length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <h3 style={{ marginBottom: 6 }}>Event Type Breakdown</h3>
          <ul style={{ marginTop: 0 }}>
            {Object.entries(eventTypeBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <li key={type}>
                  <strong>{type}</strong>: {count}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      {!loading && !error && stalePending.length > 0 ? (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", minWidth: 860, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Type</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Received</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Processed</th>
              </tr>
            </thead>
            <tbody>
              {stalePending.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.event_type}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {new Date(row.received_at).toLocaleString()}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {row.processed_at ? new Date(row.processed_at).toLocaleString() : "Pending"}
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

