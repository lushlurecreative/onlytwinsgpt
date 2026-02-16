"use client";

import { useState } from "react";
import type { PlanKey } from "@/lib/package-plans";

type BitcoinCheckoutButtonProps = {
  plan: PlanKey;
};

export default function BitcoinCheckoutButton({ plan }: BitcoinCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onBitcoinCheckout() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/bitcoin/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json().catch(() => ({}))) as { hosted_url?: string; error?: string };
      if (!res.ok || !data.hosted_url) throw new Error(data.error ?? "Bitcoin checkout failed");
      window.location.href = data.hosted_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bitcoin checkout failed");
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onBitcoinCheckout} disabled={loading}>
        {loading ? "Opening..." : "Pay with Bitcoin"}
      </button>
      {error ? <p className="muted" style={{ marginTop: 8 }}>{error}</p> : null}
    </>
  );
}

