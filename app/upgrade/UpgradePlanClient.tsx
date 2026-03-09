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
  subscription?: {
    current_period_end?: string | null;
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

type PlanKey = "starter" | "professional" | "elite";

type GenerationRow = {
  image_count?: number | null;
  video_count?: number | null;
  created_at?: string;
};

const PLAN_OPTIONS: Array<{
  key: PlanKey;
  displayName: string;
  description: string;
  monthlyPrice: string;
  photos: number;
  videos: number;
  bullets: string[];
}> = [
  {
    key: "starter",
    displayName: "Starter",
    description: "For individual creators getting started.",
    monthlyPrice: "$299/month",
    photos: 45,
    videos: 5,
    bullets: [
      "45 photos per month",
      "5 videos per month",
      "Recurring monthly request mix",
      "Private delivery workflow",
    ],
  },
  {
    key: "professional",
    displayName: "Growth",
    description: "More monthly output for consistent AI content production.",
    monthlyPrice: "$599/month",
    photos: 90,
    videos: 15,
    bullets: [
      "90 photos per month",
      "15 videos per month",
      "Higher monthly creative volume",
      "Priority recurring request planning",
    ],
  },
  {
    key: "elite",
    displayName: "Scale",
    description: "For higher-volume creators, teams, and agencies.",
    monthlyPrice: "$1,299/month",
    photos: 200,
    videos: 35,
    bullets: [
      "200 photos per month",
      "35 videos per month",
      "Built for team-level output",
      "Best for high-frequency campaigns",
    ],
  },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "Date unavailable";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getRenewalLine(value: string | null | undefined) {
  if (!value) return "Renewal date unavailable";
  return `Renews ${formatDate(value)}`;
}

function formatAllowance(photos: number, videos: number) {
  return `Includes ${photos} photos and ${videos} videos per month`;
}

export default function UpgradePlanClient() {
  const [currentPlanKey, setCurrentPlanKey] = useState<PlanKey | "">("");
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [usedPhotos, setUsedPhotos] = useState(0);
  const [usedVideos, setUsedVideos] = useState(0);
  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanKey | "">("");
  const [preview, setPreview] = useState<UpgradePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");

  const loadPreview = useCallback(async (planKey: PlanKey) => {
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
      const [entitlementsRes, requestsRes] = await Promise.all([
        fetch("/api/me/entitlements"),
        fetch("/api/generation-requests"),
      ]);
      const entitlementsJson = (await entitlementsRes.json().catch(() => ({}))) as EntitlementsResponse;
      const requestsJson = (await requestsRes.json().catch(() => ({}))) as { requests?: GenerationRow[] };
      const key = (entitlementsJson.entitlements?.planKey ?? "") as PlanKey | "";
      setCurrentPlanKey(key);
      setRenewalDate(entitlementsJson.subscription?.current_period_end ?? null);
      const requests = requestsJson.requests ?? [];
      setUsedPhotos(
        requests.reduce((sum, row) => sum + Math.max(0, Number(row.image_count ?? 0)), 0)
      );
      setUsedVideos(
        requests.reduce((sum, row) => sum + Math.max(0, Number(row.video_count ?? 0)), 0)
      );
      const options = PLAN_OPTIONS.filter((opt) =>
        key === "starter" ? opt.key !== "starter" : key === "professional" ? opt.key === "elite" : false
      );
      const defaultTarget = (options[0]?.key ?? "") as PlanKey | "";
      setSelectedPlanKey(defaultTarget);
      if (defaultTarget) {
        await loadPreview(defaultTarget);
      }
    })();
  }, [loadPreview]);

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

  const currentPlan = useMemo(
    () => PLAN_OPTIONS.find((plan) => plan.key === currentPlanKey) ?? null,
    [currentPlanKey]
  );
  const totalPhotos = currentPlan?.photos ?? 0;
  const totalVideos = currentPlan?.videos ?? 0;
  const remainingPhotos = Math.max(0, totalPhotos - usedPhotos);
  const remainingVideos = Math.max(0, totalVideos - usedVideos);
  const photosPct = totalPhotos > 0 ? Math.max(0, Math.min(100, Math.round((remainingPhotos / totalPhotos) * 100))) : 0;
  const videosPct = totalVideos > 0 ? Math.max(0, Math.min(100, Math.round((remainingVideos / totalVideos) * 100))) : 0;

  return (
    <>
      <section className="upgrade-shell">
        <article className="upgrade-hero">
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 3.4vw, 3rem)" }}>Plans &amp; billing</h1>
          <p style={{ margin: "12px 0 0", color: "rgba(217,236,255,0.86)", maxWidth: 880 }}>
            Change your plan anytime. If you upgrade mid-cycle, we automatically apply credit for the unused portion
            of your current plan.
          </p>
        </article>

        <section className="upgrade-summary-grid">
          <article className="upgrade-summary-card">
            <p className="upgrade-card-title">Your current plan</p>
            {currentPlan ? (
              <>
                <h2>{currentPlan.displayName}</h2>
                <p>{getRenewalLine(renewalDate)}</p>
                <p>{formatAllowance(currentPlan.photos, currentPlan.videos)}</p>
                <div style={{ marginTop: 18 }}>
                  <PremiumButton href="/billing">Manage billing</PremiumButton>
                </div>
              </>
            ) : (
              <>
                <h2>No active plan</h2>
                <p>Choose a plan to start monthly generation.</p>
                <div style={{ marginTop: 18 }}>
                  <PremiumButton href="/pricing">Choose a plan</PremiumButton>
                </div>
              </>
            )}
          </article>

          <article className="upgrade-summary-card">
            <p className="upgrade-card-title">This cycle</p>
            <p className="upgrade-cycle-line">Photos: {remainingPhotos} / {totalPhotos || 0} remaining</p>
            <div className="upgrade-progress">
              <div className="upgrade-progress-fill" style={{ width: `${photosPct}%` }} />
            </div>
            <p className="upgrade-cycle-line" style={{ marginTop: 14 }}>
              Videos: {remainingVideos} / {totalVideos || 0} remaining
            </p>
            <div className="upgrade-progress">
              <div className="upgrade-progress-fill" style={{ width: `${videosPct}%` }} />
            </div>
            <p className="upgrade-helper">
              Your saved request mix repeats each month unless updated at least 5 days before renewal.
            </p>
          </article>
        </section>

        <section className="upgrade-plan-grid">
          {PLAN_OPTIONS.map((plan) => {
            const isCurrent = currentPlanKey === plan.key;
            const isEnterpriseStyle = plan.key === "elite";
            return (
              <article key={plan.key} className={`upgrade-plan-card ${isCurrent ? "is-current" : ""}`.trim()}>
                <div className="upgrade-plan-head">
                  <h3>{plan.displayName}</h3>
                  {isCurrent ? <span className="upgrade-badge">Current plan</span> : null}
                </div>
                <p>{plan.description}</p>
                <div className="upgrade-price">{plan.monthlyPrice}</div>
                <p className="upgrade-allowance">{formatAllowance(plan.photos, plan.videos)}</p>
                <ul>
                  {plan.bullets.slice(0, 6).map((bullet) => (
                    <li key={`${plan.key}-${bullet}`}>{bullet}</li>
                  ))}
                </ul>
                {isCurrent ? (
                  <PremiumButton type="button" disabled>
                    Current plan
                  </PremiumButton>
                ) : isEnterpriseStyle ? (
                  <PremiumButton href="/contact">Contact sales</PremiumButton>
                ) : (
                  <PremiumButton
                    type="button"
                    onClick={() => {
                      setSelectedPlanKey(plan.key);
                      void loadPreview(plan.key);
                      setShowModal(true);
                    }}
                  >
                    Upgrade
                  </PremiumButton>
                )}
              </article>
            );
          })}
        </section>
      </section>

      {showModal ? (
        <div className="upgrade-modal-backdrop" role="dialog" aria-modal="true" aria-label="Upgrade modal">
          <div className="upgrade-modal">
            <header>
              <h3>Upgrade to {PLAN_OPTIONS.find((plan) => plan.key === selectedPlanKey)?.displayName ?? "Plan"}</h3>
              <p>Here&apos;s what changes if you upgrade today.</p>
            </header>

            <section className="upgrade-due-card">
              <p className="upgrade-card-title">Due today</p>
              <div className="upgrade-due-amount">{preview?.preview.dueTodayFormatted ?? "$0.00"}</div>
              <p>Current plan credit applied: {preview?.preview.customerCreditFormatted ?? "$0.00"}</p>
              <p>New plan charge today: {preview?.preview.prorationChargeFormatted ?? "$0.00"}</p>
              <p>
                New monthly renewal:{" "}
                {preview
                  ? new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: preview.preview.currency || "USD",
                    }).format(preview.targetPlan.monthlyPriceCents / 100)
                  : "$0.00"}{" "}
                starting {formatDate(renewalDate)}
              </p>
            </section>

            <section>
              <h4 style={{ margin: "0 0 8px" }}>What changes</h4>
              <ul className="upgrade-change-list">
                <li>Your upgraded plan starts immediately</li>
                <li>Unused value from your current plan is automatically applied</li>
                <li>Your monthly allowance increases with the new plan</li>
                <li>Your next renewal will be on {formatDate(renewalDate)}</li>
              </ul>
            </section>

            {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
            {loadingPreview ? <p style={{ margin: 0, opacity: 0.8 }}>Loading pricing details...</p> : null}

            <footer className="upgrade-modal-footer">
              <PremiumButton type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </PremiumButton>
              <PremiumButton type="button" onClick={startUpgrade} loading={upgrading} disabled={!selectedPlanKey}>
                Confirm upgrade
              </PremiumButton>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
