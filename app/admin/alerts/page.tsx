"use client";

import { useEffect, useState } from "react";

type AlertRow = {
  key: string;
  severity: "ok" | "low" | "medium" | "high";
  value: number;
  description: string;
};

export default function AdminAlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState("");
  const [webhookTableMissing, setWebhookTableMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch("/api/admin/alerts");
      const result = (await response.json().catch(() => ({}))) as {
        alerts?: AlertRow[];
        generatedAt?: string;
        webhookTableMissing?: boolean;
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Failed to load alerts");
        setLoading(false);
        return;
      }
      setAlerts(result.alerts ?? []);
      setGeneratedAt(result.generatedAt ?? "");
      setWebhookTableMissing(!!result.webhookTableMissing);
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Alerts Center</h2>
      <p>Centralized operational alert signals for billing + webhook reliability.</p>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {!loading && !error && generatedAt ? (
        <p>
          Last generated: <strong>{new Date(generatedAt).toLocaleString()}</strong>
        </p>
      ) : null}
      {!loading && !error && webhookTableMissing ? (
        <p>⚠️ Webhook events table missing. Run latest migration to enable webhook alerts.</p>
      ) : null}
      {!loading && !error && alerts.length > 0 ? (
        <ul style={{ marginTop: 10 }}>
          {alerts.map((alert) => (
            <li key={alert.key} style={{ marginBottom: 10 }}>
              <strong>{alert.severity.toUpperCase()}</strong> — {alert.description}:{" "}
              <strong>{alert.value}</strong>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

