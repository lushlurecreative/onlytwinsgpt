"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type PostRow = {
  id: string;
  caption: string | null;
  created_at: string;
  signed_url: string | null;
};

export default function LibraryClient() {
  const [rows, setRows] = useState<PostRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/posts");
      const result = (await response.json().catch(() => ({}))) as {
        posts?: PostRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Could not load library.");
        return;
      }
      setRows(result.posts ?? []);
    };
    void load();
  }, []);

  if (error) {
    return <p style={{ color: "var(--danger)" }}>{error}</p>;
  }

  if (rows.length === 0) {
    return (
      <article className="premium-card" style={{ padding: 18 }}>
        <p style={{ margin: 0, opacity: 0.8 }}>
          No completed assets yet. Once generation finishes, your library will populate automatically.
        </p>
      </article>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
      }}
    >
      {rows.map((row) => (
        <motion.article
          key={row.id}
          className="premium-card"
          style={{ padding: 10 }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          {row.signed_url ? (
            <img
              src={row.signed_url}
              alt={row.caption ?? "Generated image"}
              style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 8 }}
            />
          ) : (
            <div style={{ height: 180, borderRadius: 8, background: "#111" }} />
          )}
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>
            {new Date(row.created_at).toLocaleDateString()}
          </div>
          {row.signed_url ? (
            <a href={row.signed_url} download style={{ marginTop: 8, display: "inline-block" }}>
              Download
            </a>
          ) : null}
        </motion.article>
      ))}
    </div>
  );
}
