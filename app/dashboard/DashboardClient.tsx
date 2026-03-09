"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";
import ControlIcon from "@/components/ControlIcon";

type StatusCard = {
  label: string;
  value: string;
  progress: number;
};

type SetupStep = {
  key: "preferences" | "photos" | "generation";
  title: string;
  description: string;
  buttonText: string;
  viewHref: string;
  editHref: string;
};

type UtilityCard = {
  key: "status" | "library" | "billing";
  title: string;
  description: string;
  buttonText: string;
  href: string;
  icon: string;
};

type ActionCard = SetupStep | UtilityCard;

const steps: SetupStep[] = [
  {
    key: "preferences",
    title: "Step 1: Set Preferences",
    description: "Complete onboarding intake with your identity details, bio, constraints, and style rules.",
    buttonText: "Set Preferences",
    viewHref: "/dashboard",
    editHref: "/onboarding/intake",
  },
  {
    key: "photos",
    title: "Step 2: Upload Training Photos",
    description: "Upload approved training images so we can start model training with clean source data.",
    buttonText: "Upload Photos",
    viewHref: "/training/photos",
    editHref: "/training/photos",
  },
  {
    key: "generation",
    title: "Step 3: Choose Generation Preferences",
    description: "Choose your monthly photo/video mix and exact prompt directions for default generations.",
    buttonText: "Choose Preferences",
    viewHref: "/requests",
    editHref: "/requests",
  },
];

export default function DashboardClient() {
  const INTAKE_LOCAL_KEY = "ot_onboarding_intake_v1";
  const PREFS_LOCAL_KEY = "ot_request_allocation_plan_v1";
  const AUTO_QUEUE_KEY = "ot_auto_queue_v1";

  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState({
    preferences: false,
    photos: false,
    generation: false,
  });
  const [photoCount, setPhotoCount] = useState(0);
  const [samplePaths, setSamplePaths] = useState<string[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [queueing, setQueueing] = useState(false);
  const [queueMessage, setQueueMessage] = useState("");
  const [planLabel, setPlanLabel] = useState("Active Plan");
  const [latestSyncAt, setLatestSyncAt] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [intakeRes, uploadsRes, prefsRes, entitlementsRes] = await Promise.all([
        fetch("/api/me/onboarding-intake"),
        fetch("/api/uploads"),
        fetch("/api/me/request-preferences"),
        fetch("/api/me/entitlements"),
      ]);

      const intakeJson = (await intakeRes.json().catch(() => ({}))) as {
        intake?: {
          name?: string;
          age?: string;
          email?: string;
          whatsapp?: string;
          realBio?: string;
          desiredBio?: string;
        } | null;
      };
      const uploadsJson = (await uploadsRes.json().catch(() => ({}))) as {
        files?: Array<{ objectPath: string }>;
      };
      const prefsJson = (await prefsRes.json().catch(() => ({}))) as {
        preferences?: { allocationRows?: Array<{ direction?: string; count?: number }> } | null;
      };
      const entitlementsJson = (await entitlementsRes.json().catch(() => ({}))) as {
        entitlements?: {
          planKey?: string;
        } | null;
      };
      const requestsRes = await fetch("/api/generation-requests");
      const requestsJson = (await requestsRes.json().catch(() => ({}))) as {
        requests?: Array<{ id: string }>;
      };

      let intake = intakeJson.intake;
      let prefRows = prefsJson.preferences?.allocationRows ?? [];

      try {
        const intakeLocalRaw = window.localStorage.getItem(INTAKE_LOCAL_KEY);
        if (!intake && intakeLocalRaw) {
          intake = JSON.parse(intakeLocalRaw) as typeof intake;
        }
      } catch {}
      try {
        const prefsLocalRaw = window.localStorage.getItem(PREFS_LOCAL_KEY);
        if ((!prefRows || prefRows.length === 0) && prefsLocalRaw) {
          const local = JSON.parse(prefsLocalRaw) as { allocationRows?: Array<{ direction?: string; count?: number }> };
          prefRows = local.allocationRows ?? [];
        }
      } catch {}

      const files = uploadsJson.files ?? [];
      setPhotoCount(files.length);
      setSamplePaths(files.map((file) => file.objectPath));
      setRequestCount((requestsJson.requests ?? []).length);

      const preferencesDone = !!(
        intake?.name?.trim() &&
        intake?.age?.trim() &&
        intake?.email?.trim() &&
        intake?.whatsapp?.trim() &&
        intake?.realBio?.trim() &&
        intake?.desiredBio?.trim()
      );
      const photosDone = files.length >= 10;
      const generationDone = prefRows.length > 0 && prefRows.some((row) => (row.direction ?? "").trim().length > 0);
      const entitlementPlan = entitlementsJson.entitlements?.planKey ?? "";
      if (entitlementPlan === "starter") {
        setPlanLabel("Starter · 45 photos + 5 videos");
      } else if (entitlementPlan === "professional") {
        setPlanLabel("Professional · 90 photos + 15 videos");
      } else if (entitlementPlan === "elite") {
        setPlanLabel("Elite · 200 photos + 35 videos");
      } else {
        setPlanLabel("Active Plan · Syncing entitlements");
      }

      setCompleted({
        preferences: preferencesDone,
        photos: photosDone,
        generation: generationDone,
      });
      setLatestSyncAt(new Date().toISOString());
      setLoading(false);
    };

    void load();
    const refreshMs = 17000;
    const timer = window.setInterval(() => {
      void load();
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, []);

  const completedCount = useMemo(
    () => [completed.preferences, completed.photos, completed.generation].filter(Boolean).length,
    [completed]
  );
  const allStepsDone = completedCount === 3;
  const progressPct = Math.round((completedCount / 3) * 100);
  const nextStep = !completed.preferences
    ? steps[0]
    : !completed.photos
      ? steps[1]
      : !completed.generation
        ? steps[2]
        : null;

  const statusCards: StatusCard[] = [
    {
      label: "Setup Progress",
      value: `${completedCount}/3 steps completed`,
      progress: progressPct,
    },
    {
      label: "Preferences",
      value: completed.preferences ? "Completed" : "Pending",
      progress: completed.preferences ? 100 : 20,
    },
    {
      label: "Training Photos",
      value: completed.photos ? `Completed (${photoCount})` : `In progress (${photoCount}/10 minimum)`,
      progress: Math.max(10, Math.min(100, Math.round((photoCount / 10) * 100))),
    },
    {
      label: "Generation Preferences",
      value: completed.generation ? "Completed" : "Pending",
      progress: completed.generation ? 100 : 20,
    },
  ];

  const actionCards: ActionCard[] = [
    ...steps,
    {
      key: "status",
      title: "View My Requests",
      description: "Track your training and generation progress.",
      buttonText: "View Status",
      href: "/status",
      icon: "Q",
    },
    {
      key: "library",
      title: "Open My Library",
      description: "View and download your completed images.",
      buttonText: "Open Library",
      href: "/library",
      icon: "L",
    },
    {
      key: "billing",
      title: "Account & Billing",
      description: "Manage your plan, email, and billing details.",
      buttonText: "Open Account",
      href: "/billing",
      icon: "B",
    },
  ];

  const queueFirstJob = useCallback(async () => {
    if (queueing) return;
    if (samplePaths.length < 10) {
      setQueueMessage("Upload at least 10 photos before queueing.");
      return;
    }
    setQueueing(true);
    setQueueMessage("");
    const response = await fetch("/api/generation-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        samplePaths: samplePaths.slice(0, 10),
        scenePreset: "gym",
        imageCount: 10,
        videoCount: 0,
        contentMode: "sfw",
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setQueueMessage(result.error ?? "Could not queue generation job.");
      setQueueing(false);
      return;
    }
    setQueueMessage("Generation job queued successfully.");
    try {
      window.localStorage.setItem(AUTO_QUEUE_KEY, "queued");
    } catch {}
    setQueueing(false);
  }, [AUTO_QUEUE_KEY, queueing, samplePaths]);

  useEffect(() => {
    if (loading || queueing) return;
    if (!allStepsDone || requestCount > 0 || samplePaths.length < 10) return;
    try {
      const queued = window.localStorage.getItem(AUTO_QUEUE_KEY);
      if (queued === "queued") return;
    } catch {}
    const timer = window.setTimeout(() => {
      void queueFirstJob();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [allStepsDone, loading, queueing, requestCount, samplePaths.length, queueFirstJob]);

  return (
    <div className="premium-dashboard control-shell">
      <section className="premium-hero control-hero">
        <div className="control-hero-top">
          <div>
            <p className="eyebrow">Customer Command Center</p>
            <h1>Welcome back to your AI control center</h1>
            <p>
              Calm, guided setup with real-time status. Complete your onboarding once, then run generation from
              one premium workspace.
            </p>
            <div className="control-pill-row">
              <span className="badge">Subscription Active</span>
              <span className="badge">Progress {progressPct}%</span>
              <span className="badge">{planLabel}</span>
            </div>
          </div>
          <div className="ring-wrap">
            <div
              className="ring-track"
              style={{
                background: `conic-gradient(var(--accent) ${progressPct}%, rgba(255,255,255,0.14) ${progressPct}% 100%)`,
              }}
            >
              <div className="ring-core">{progressPct}%</div>
            </div>
          </div>
        </div>
        <div className="cta-row">
          <PremiumButton href={nextStep?.editHref ?? "/status"}>
            {nextStep?.key === "photos"
              ? "Upload Photos To Start"
              : nextStep?.key === "preferences"
                ? "Continue Setup"
                : nextStep?.key === "generation"
                  ? "Finalize Generation Plan"
                  : "Open Live Status"}
          </PremiumButton>
          <PremiumButton href="/status" variant="secondary">
            View Generation Status
          </PremiumButton>
        </div>
      </section>

      {loading ? (
        <section className="control-grid section">
          {Array.from({ length: 5 }).map((_, idx) => (
            <PremiumCard key={`control-skeleton-${idx}`}>
              <div className="skeleton-line w-40" />
              <div className="skeleton-line w-80" />
              <div className="skeleton-line w-30" />
            </PremiumCard>
          ))}
        </section>
      ) : (
        <section className="control-grid section">
          <PremiumCard
            title="Twin Status"
            subtitle={completed.preferences ? "Identity profile configured" : "Identity profile pending"}
            action={<ControlIcon glyph="T" label="Twin Status" />}
          />
          <PremiumCard
            title="Training Status"
            subtitle={completed.photos ? `${photoCount} photos uploaded and ready` : `${photoCount}/10 minimum uploaded`}
            action={<ControlIcon glyph="P" label="Training Status" />}
          />
          <PremiumCard title="Current Plan" subtitle={planLabel} action={<ControlIcon glyph="$" label="Current Plan" />} />
          <PremiumCard
            title="Generation Queue"
            subtitle={requestCount > 0 ? `${requestCount} request(s) in pipeline` : "No active requests yet"}
            action={<ControlIcon glyph="Q" label="Generation Queue" />}
          />
          <PremiumCard
            title="Latest Activity"
            subtitle={latestSyncAt ? `Synced ${new Date(latestSyncAt).toLocaleString()}` : "Syncing dashboard state..."}
            action={<ControlIcon glyph="A" label="Latest Activity" />}
          />
        </section>
      )}

      {allStepsDone && requestCount === 0 ? (
        <section className="section">
          <PremiumCard title="Ready to launch" subtitle="All setup steps are completed. Queue your first generation now.">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <PremiumButton type="button" onClick={queueFirstJob} loading={queueing}>
                Queue First Generation Job
              </PremiumButton>
              {queueMessage ? <span style={{ color: queueMessage.includes("success") ? "var(--success)" : "var(--danger)" }}>{queueMessage}</span> : null}
            </div>
          </PremiumCard>
        </section>
      ) : null}

      <section className="premium-status-grid section">
        {loading
          ? Array.from({ length: 4 }).map((_, idx) => (
              <PremiumCard key={`status-skeleton-${idx}`} className="premium-status-card">
                <div className="skeleton-line w-30" />
                <div className="skeleton-line w-60" />
                <div className="skeleton-bar" />
              </PremiumCard>
            ))
          : statusCards.map((card, idx) => (
              <PremiumCard key={card.label} className="premium-status-card">
                <div className="status-label">{card.label}</div>
                <div className="status-value">{card.value}</div>
                <div className="status-progress">
                  <motion.div
                    className="status-progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${card.progress}%` }}
                    transition={{ duration: 0.8 + idx * 0.08, ease: "easeOut" }}
                  />
                </div>
              </PremiumCard>
            ))}
      </section>

      <section className="feature-grid section">
        {actionCards.map((card, idx) => (
          <motion.div
            key={`${card.key}-${card.title}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: idx * 0.04 }}
          >
            <PremiumCard
              title={card.title}
              subtitle={card.description}
              action={<ControlIcon glyph={"icon" in card ? card.icon : card.key === "preferences" ? "1" : card.key === "photos" ? "2" : "3"} label={card.title} />}
            >
              {"viewHref" in card ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="badge">
                    {loading
                      ? "Checking..."
                      : completed[card.key]
                        ? "Completed"
                        : "Pending"}
                  </span>
                  <PremiumButton href={card.viewHref} variant={completed[card.key] ? "secondary" : "primary"}>
                    {completed[card.key] ? "View" : card.buttonText}
                  </PremiumButton>
                  {completed[card.key] ? (
                    <PremiumButton href={card.editHref} variant="ghost">
                      Edit
                    </PremiumButton>
                  ) : null}
                </div>
              ) : (
                <PremiumButton href={card.href}>{card.buttonText}</PremiumButton>
              )}
            </PremiumCard>
          </motion.div>
        ))}
      </section>

      {!loading && requestCount === 0 ? (
        <section className="section">
          <PremiumCard className="premium-empty">
            <div className="empty-visual">Q</div>
            <h3 style={{ marginTop: 0 }}>No generation activity yet</h3>
            <p className="wizard-copy">
              Your queue is ready. Complete setup steps and launch your first generation to populate live activity.
            </p>
          </PremiumCard>
        </section>
      ) : null}
    </div>
  );
}
