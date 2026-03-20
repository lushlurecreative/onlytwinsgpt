"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function BecomeCreatorClient() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "vault";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function becomeCreator() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/me/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "creator" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      window.location.href = from === "creator" ? "/creator" : "/vault";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Creator access</h1>
      <p className="muted">
        Vault, uploads, and the creator dashboard are for creators. Request access to create content and manage your audience.
      </p>
      {error ? <p style={{ color: "var(--error, #e5534b)" }}>{error}</p> : null}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void becomeCreator()}
          disabled={loading}
        >
          {loading ? "Requesting…" : "Become a creator"}
        </button>
      </div>
    </main>
  );
}
