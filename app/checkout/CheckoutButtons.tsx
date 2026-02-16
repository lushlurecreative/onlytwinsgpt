"use client";

import { useState } from "react";
import { PACKAGE_PLANS, type PlanKey } from "@/lib/package-plans";

export default function CheckoutButtons() {
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(plan: PlanKey) {
    setLoadingPlan(plan);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Checkout failed");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoadingPlan(null);
    }
  }

  const plans = Object.entries(PACKAGE_PLANS) as [PlanKey, (typeof PACKAGE_PLANS)[PlanKey]][];

  return (
    <div className="feature-grid">
      {plans.map(([key, plan]) => (
        <article key={key} className="card">
          <h3>{plan.name}</h3>
          <p className="kpi">{plan.displayPrice}</p>
          <div className="cta-row">
            <button
              className="btn btn-primary"
              disabled={loadingPlan !== null}
              onClick={() => start(key)}
              type="button"
            >
              {loadingPlan === key ? "Opening..." : "Checkout"}
            </button>
          </div>
        </article>
      ))}
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}

