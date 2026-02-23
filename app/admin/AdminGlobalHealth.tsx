"use client";

import { useEffect, useState } from "react";

type HealthState = {
  status: "green" | "yellow" | "red";
  reason: string;
  timestamp: string;
};

export default function AdminGlobalHealth() {
  const [health, setHealth] = useState<HealthState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/admin/health");
        if (cancelled) return;

        if (!res.ok) {
          setHealth({
            status: "red",
            reason: "Health check failed",
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const data = await res.json().catch(() => null);
        if (!data || typeof data.status !== "string") {
          setHealth({
            status: "red",
            reason: "Invalid health response",
            timestamp: new Date().toISOString(),
          });
          return;
        }

        setHealth({
          status: data.status,
          reason: typeof data.reason === "string" ? data.reason : "Unknown",
          timestamp: typeof data.timestamp === "string" ? data.timestamp : new Date().toISOString(),
        });
      } catch {
        if (!cancelled) {
          setHealth({
            status: "red",
            reason: "Health check failed",
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    void load();
    const t = setInterval(load, 30 * 1000);
    const onRefresh = () => {
      if (!cancelled) void load();
    };
    window.addEventListener("admin-health-refresh", onRefresh);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("admin-health-refresh", onRefresh);
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
