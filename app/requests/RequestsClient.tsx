"use client";

import { useEffect, useState } from "react";

type RequestRow = {
  id: string;
  status: string;
  progress_done: number;
  progress_total: number;
  created_at: string;
  scene_preset: string;
};

export default function RequestsClient() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/generation-requests");
      const result = (await response.json().catch(() => ({}))) as {
        requests?: RequestRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Could not load requests.");
        return;
      }
      setRows(result.requests ?? []);
    };
    void load();
  }, []);

  if (error) {
    return <p style={{ color: "var(--danger)" }}>{error}</p>;
  }

  if (rows.length === 0) {
    return <p style={{ opacity: 0.8 }}>No requests yet.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => (
        <article key={row.id} style={{ border: "1px solid #333", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <strong>{row.scene_preset}</strong>
            <span className="badge">{row.status}</span>
          </div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Progress: {row.progress_done}/{row.progress_total}
          </div>
          <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>
            {new Date(row.created_at).toLocaleString()}
          </div>
        </article>
      ))}
    </div>
  );
}
