"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type RequestRow = {
  id: string;
  status: string;
  progress_done: number;
  progress_total: number;
  created_at: string;
  scene_preset: string;
};

export default function StatusClient() {
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
        setError(result.error ?? "Could not load generation status.");
        return;
      }
      setRows(result.requests ?? []);
    };
    void load();
  }, []);

  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;

  if (rows.length === 0) {
    return (
      <article className="premium-card" style={{ padding: 18 }}>
        <p style={{ margin: 0, opacity: 0.8 }}>
          No generation jobs yet. Once requests are submitted, live status will appear here.
        </p>
      </article>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row, idx) => (
        <motion.article
          key={row.id}
          className="premium-card"
          style={{ padding: 14 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: idx * 0.04 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <strong>{row.scene_preset}</strong>
            <span className="badge">{row.status}</span>
          </div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Progress: {row.progress_done}/{row.progress_total}
          </div>
          <div className="status-progress" style={{ marginTop: 8 }}>
            <motion.div
              className="status-progress-fill"
              initial={{ width: 0 }}
              animate={{
                width:
                  row.progress_total > 0
                    ? `${Math.min(100, Math.max(0, (row.progress_done / row.progress_total) * 100))}%`
                    : "0%",
              }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          </div>
          <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>
            {new Date(row.created_at).toLocaleString()}
          </div>
        </motion.article>
      ))}
    </div>
  );
}
