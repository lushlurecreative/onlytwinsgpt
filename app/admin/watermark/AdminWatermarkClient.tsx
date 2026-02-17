"use client";

import { useState } from "react";

export default function AdminWatermarkClient() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Select an image file.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const r = await fetch("/api/admin/watermark/decode", {
        method: "POST",
        body: formData,
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Decode failed");
        return;
      }
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Decoding…" : "Decode"}
        </button>
      </form>
      {error && <p style={{ color: "red", marginTop: 16 }}>{error}</p>}
      {result && (
        <pre style={{ marginTop: 16, padding: 16, background: "#f5f5f5", overflow: "auto" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
