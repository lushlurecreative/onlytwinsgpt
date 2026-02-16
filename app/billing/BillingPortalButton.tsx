"use client";

import { useState } from "react";

export default function BillingPortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openPortal() {
    setLoading(true);
    setError("");
    const returnUrl =
      typeof window !== "undefined" ? `${window.location.origin}/billing` : undefined;
    const response = await fetch("/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnUrl }),
    });
    const result = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!response.ok || !result.url) {
      setLoading(false);
      setError(result.error ?? "Failed to open billing portal");
      return;
    }
    window.location.href = result.url;
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={openPortal} disabled={loading} style={{ padding: "8px 12px" }}>
        {loading ? "Opening..." : "Manage Billing in Stripe"}
      </button>
      {error ? <p style={{ color: "red", marginTop: 6 }}>❌ {error}</p> : null}
    </div>
  );
}

