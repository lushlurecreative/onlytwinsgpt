"use client";

import { useEffect, useState } from "react";

type WebhookEventRow = {
  id: string;
  stripe_event_id: string;
  event_type: string;
  received_at: string;
  processed_at: string | null;
};

type Summary = {
  total: number;
  processed: number;
  unprocessed: number;
};

export default function AdminWebhookEventsPage() {
  const [rows, setRows] = useState<WebhookEventRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, processed: 0, unprocessed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch("/api/admin/webhook-events");
      const result = (await response.json().catch(() => ({}))) as {
        events?: WebhookEventRow[];
        summary?: Summary;
        warning?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? "Failed to load webhook events");
        setLoading(false);
        return;
      }

      setRows(result.events ?? []);
      if (result.summary) setSummary(result.summary);
      setWarning(result.warning ?? "");
      setLoading(false);
    }

    void load();
  }, []);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Webhook Events</h2>
      <p>Operational Stripe event stream for delivery + processing visibility.</p>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {warning ? <p>⚠️ {warning}</p> : null}
      {!loading && !error ? (
        <p>
          Total: <strong>{summary.total}</strong> | Processed: <strong>{summary.processed}</strong>{" "}
          | Unprocessed: <strong>{summary.unprocessed}</strong>
        </p>
      ) : null}
      {!loading && !error && rows.length === 0 ? <p>No webhook events found.</p> : null}
      {!loading && !error && rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 1020, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Type</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Event ID</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Received</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Processed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.event_type}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    <code>{row.stripe_event_id}</code>
                  </td>
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

