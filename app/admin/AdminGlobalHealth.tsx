"use client";

import { useEffect, useState } from "react";

type HealthState = {
  status: "green" | "yellow" | "red";
  reason: string;
  lastUpdated: string;
};

export default function AdminGlobalHealth() {
  const [health, setHealth] = useState<HealthState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [workerRes, webhookRes] = await Promise.all([
          fetch("/api/admin/worker/config"),
          fetch("/api/admin/webhook-health"),
        ]);

        if (cancelled) return;

        const worker = workerRes.ok ? await workerRes.json().catch(() => null) : null;
        const webhook = webhookRes.ok ? await webhookRes.json().catch(() => null) : null;

        const workerOk = worker?.health?.ok !== false && !worker?.health?.error;
        const workerConfigured = worker?.configured === true;
        const stalePending = webhook?.summary?.stalePendingOver10m ?? 0;
        const pending = webhook?.summary?.pending ?? 0;
        const webhookWarning = webhook?.warning;

        const critical: string[] = [];
        const warning: string[] = [];

        if (!workerOk && workerConfigured) critical.push("Worker unhealthy");
        if (stalePending > 0) critical.push("Stripe webhook backlog");
        if (webhookWarning && String(webhookWarning).toLowerCase().includes("missing"))
          warning.push("Webhook table missing");

        if (!workerConfigured) warning.push("Worker not configured");
        if (pending > 0 && stalePending === 0) warning.push("Webhook events pending");

        let status: "green" | "yellow" | "red" = "green";
        let reason = "All systems OK";

        if (critical.length > 0) {
          status = "red";
          reason = critical.join("; ");
        } else if (warning.length > 0) {
          status = "yellow";
          reason = warning.join("; ");
        }

        setHealth({
          status,
          reason,
          lastUpdated: new Date().toISOString(),
        });
      } catch {
        if (!cancelled) {
          setHealth({
            status: "red",
            reason: "Health check failed",
            lastUpdated: new Date().toISOString(),
          });
        }
      }
    }

    void load();
    const t = setInterval(load, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!health) {
    return (
      <div className="admin-global-health" style={{ marginBottom: 12, padding: "8px 12px", background: "#222", borderRadius: 8 }}>
        <span className="muted">Loading status…</span>
      </div>
    );
  }

  const dot = health.status === "green" ? "🟢" : health.status === "yellow" ? "🟡" : "🔴";
  const label = health.status === "green" ? "System OK" : health.status === "yellow" ? "Warnings" : "Issues";

  return (
    <div
      className="admin-global-health"
      style={{
        marginBottom: 12,
        padding: "8px 12px",
        background: health.status === "red" ? "#2a1515" : health.status === "yellow" ? "#2a2515" : "#152a15",
        borderRadius: 8,
        border: `1px solid ${health.status === "red" ? "#633" : health.status === "yellow" ? "#663" : "#363"}`,
      }}
    >
      <strong>{dot} {label}</strong>
      {health.reason && health.reason !== "All systems OK" && (
        <span style={{ marginLeft: 8, opacity: 0.9 }}>{health.reason}</span>
      )}
    </div>
  );
}
