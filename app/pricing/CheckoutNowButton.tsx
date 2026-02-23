"use client";

import { useState } from "react";
import type { PlanKey } from "@/lib/package-plans";

type CheckoutNowButtonProps = {
  plan: PlanKey;
  className?: string;
  children: React.ReactNode;
};

export default function CheckoutNowButton({ plan, className, children }: CheckoutNowButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onCheckout() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.status === 401) {
        setLoading(false);
        setError(data.error ?? "Checkout could not start. Please try again.");
        return;
      }
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className={className ?? "btn btn-primary"} onClick={onCheckout} disabled={loading}>
        {loading ? "Opening..." : children}
      </button>
      {error ? <p className="muted" style={{ marginTop: 8 }}>{error}</p> : null}
    </>
  );
}

