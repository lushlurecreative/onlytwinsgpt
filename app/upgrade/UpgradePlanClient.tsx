"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PremiumButton from "@/components/PremiumButton";

type EntitlementsResponse = {
  entitlements?: {
    planKey: string;
    planName: string;
    includedImages: number;
    includedVideos: number;
  } | null;
};

type UpgradePreview = {
  currentPlan: {
    key: string;
    name: string;
    monthlyPriceCents: number;
  };
  targetPlan: {
    key: string;
    name: string;
    monthlyPriceCents: number;
  };
  preview: {
    customerCreditCents: number;
    prorationChargeCents: number;
    dueTodayCents: number;
    currency: string;
    customerCreditFormatted: string;
    prorationChargeFormatted: string;
    dueTodayFormatted: string;
  };
};

const PLAN_OPTIONS = [
  { key: "starter", label: "Starter", photos: 45, videos: 5 },
  { key: "professional", label: "Professional", photos: 90, videos: 15 },
  { key: "elite", label: "Elite", photos: 200, videos: 35 },
] as const;

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function UpgradePlanClient() {
  const [currentPlanKey, setCurrentPlanKey] = useState<string>("");
  const [selectedPlanKey, setSelectedPlanKey] = useState<string>("");
  const [preview, setPreview] = useState<UpgradePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState("");

  const loadPreview = useCallback(async (planKey: string) => {
    if (!planKey) return;
    setLoadingPreview(true);
    setError("");
    const response = await fetch(`/api/billing/upgrade-preview?targetPlan=${encodeURIComponent(planKey)}`);
    const result = (await response.json().catch(() => ({}))) as UpgradePreview & { error?: string };
    if (!response.ok || !result.preview) {
      setError(result.error ?? "Could not load upgrade preview.");
      setPreview(null);
      setLoadingPreview(false);
      return;
    }
    setPreview(result);
    setLoadingPreview(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/me/entitlements");
      const json = (await res.json().catch(() => ({}))) as EntitlementsResponse;
      const key = json.entitlements?.planKey ?? "";
      setCurrentPlanKey(key);
      const options = PLAN_OPTIONS.filter((opt) => (key === "starter" ? opt.key !== "starter" : key === "professional" ? opt.key === "elite" : false));
      const defaultTarget = options[0]?.key ?? "";
      setSelectedPlanKey(defaultTarget);
      if (defaultTarget) {
        await loadPreview(defaultTarget);
      }
    })();
  }, [loadPreview]);

  const selectablePlans = useMemo(() => {
    if (currentPlanKey === "starter") return PLAN_OPTIONS.filter((plan) => plan.key !== "starter");
    if (currentPlanKey === "professional") return PLAN_OPTIONS.filter((plan) => plan.key === "elite");
    return [];
  }, [currentPlanKey]);

  const startUpgrade = async () => {
    if (!selectedPlanKey) return;
    setUpgrading(true);
    setError("");
    const response = await fetch("/api/billing/upgrade-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetPlan: selectedPlanKey,
        returnUrl: `${window.location.origin}/upgrade`,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!response.ok || !result.url) {
      setError(result.error ?? "Could not start upgrade flow.");
      setUpgrading(false);
      return;
    }
    window.location.href = result.url;
  };

  return (
    <div className="planner-stack">
      <article className="premium-card planner-hero">
        <h1 style={{ marginTop: 0 }}>Upgrade your plan</h1>
        <p className="planner-copy">
          Compare plans, preview real Stripe proration, and confirm the exact amount due today before checkout.
        </p>
      </article>

      <section className="planner-summary-grid">
        <article className="premium-card">
          <div className="status-label">Current plan</div>
          <div className="status-value">
            {currentPlanKey ? PLAN_OPTIONS.find((plan) => plan.key === currentPlanKey)?.label ?? currentPlanKey : "Loading..."}
          </div>
          <div className="muted">Monthly subscription</div>
        </article>
        <article className="premium-card">
          <div className="status-label">Upgrade target</div>
          <div className="status-value">
            {selectedPlanKey ? PLAN_OPTIONS.find((plan) => plan.key === selectedPlanKey)?.label ?? selectedPlanKey : "No upgrade available"}
          </div>
          <div className="muted">Higher monthly allowance</div>
        </article>
        <article className="premium-card">
          <div className="status-label">Amount due today</div>
          <div className="status-value">{preview ? preview.preview.dueTodayFormatted : "Preview required"}</div>
          <div className="muted">Includes Stripe proration credit</div>
        </article>
      </section>

      <article className="premium-card planner-config">
        <h3 style={{ marginTop: 0 }}>Choose higher plan</h3>
        <div className="planner-line-items">
          {selectablePlans.length === 0 ? (
            <p className="planner-copy" style={{ margin: 0 }}>
              You are already on the highest eligible tier.
            </p>
          ) : (
            selectablePlans.map((plan) => (
              <button
                key={plan.key}
                type="button"
                className={`tab ${selectedPlanKey === plan.key ? "tab-active" : ""}`.trim()}
                onClick={() => {
                  setSelectedPlanKey(plan.key);
                  void loadPreview(plan.key);
                }}
              >
                {plan.label} · {plan.photos} photos + {plan.videos} videos
              </button>
            ))
          )}
        </div>
      </article>

      <article className="premium-card planner-config">
        <h3 style={{ marginTop: 0 }}>Proration preview</h3>
        {loadingPreview ? (
          <div>
            <div className="skeleton-line w-40" />
            <div className="skeleton-line w-60" />
          </div>
        ) : preview ? (
          <div className="planner-summary-grid">
            <div>
              <div className="status-label">Current plan credit</div>
              <div className="status-value">-{preview.preview.customerCreditFormatted}</div>
            </div>
            <div>
              <div className="status-label">New plan charge</div>
              <div className="status-value">{preview.preview.prorationChargeFormatted}</div>
            </div>
            <div>
              <div className="status-label">Due today</div>
              <div className="status-value">{preview.preview.dueTodayFormatted}</div>
            </div>
          </div>
        ) : (
          <p className="planner-copy" style={{ margin: 0 }}>
            Select a plan to preview real Stripe proration.
          </p>
        )}
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <PremiumButton type="button" onClick={startUpgrade} loading={upgrading} disabled={!selectedPlanKey}>
            Confirm upgrade
          </PremiumButton>
          <PremiumButton href="/billing" variant="secondary">
            Manage billing
          </PremiumButton>
        </div>
        {error ? <p style={{ color: "var(--danger)", marginBottom: 0 }}>{error}</p> : null}
        {preview ? (
          <p className="planner-copy" style={{ marginBottom: 0 }}>
            Stripe preview uses your live subscription period and unused balance. The final invoice is created by Stripe
            at confirmation.
          </p>
        ) : null}
      </article>

      <article className="premium-card">
        <h3 style={{ marginTop: 0 }}>Plan comparison</h3>
        <div className="planner-line-items">
          {PLAN_OPTIONS.map((plan) => (
            <div key={plan.key} className="planner-line-item">
              <strong>{plan.label}</strong>
              <span>{plan.photos} photos</span>
              <span>{plan.videos} videos</span>
              <span>{formatMoney((plan.key === "starter" ? 299 : plan.key === "professional" ? 599 : 1299) * 100)}/mo</span>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
