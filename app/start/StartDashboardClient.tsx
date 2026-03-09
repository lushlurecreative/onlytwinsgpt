"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

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

export default function StartDashboardClient() {
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

  useEffect(() => {
    const load = async () => {
      const [intakeRes, uploadsRes, prefsRes] = await Promise.all([
        fetch("/api/me/onboarding-intake"),
        fetch("/api/uploads"),
        fetch("/api/me/request-preferences"),
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

      setCompleted({
        preferences: preferencesDone,
        photos: photosDone,
        generation: generationDone,
      });
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

  const actionCards = [
    ...steps,
    {
      key: "status",
      title: "View My Requests",
      description: "Track your training and generation progress.",
      buttonText: "View Status",
      href: "/status",
    },
    {
      key: "library",
      title: "Open My Library",
      description: "View and download your completed images.",
      buttonText: "Open Library",
      href: "/library",
    },
    {
      key: "billing",
      title: "Account & Billing",
      description: "Manage your plan, email, and billing details.",
      buttonText: "Open Account",
      href: "/billing",
    },
  ] as const;

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
    <div className="premium-dashboard">
      <section className="premium-hero" style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <p className="eyebrow">AI Control Center</p>
            <h1>Welcome to OnlyTwins</h1>
            <p>
              Your subscription is active. Complete setup once, then monitor generation status from one place.
            </p>
          </div>
          <div
            style={{
              width: 110,
              height: 110,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: `conic-gradient(var(--accent) ${progressPct}%, rgba(255,255,255,0.14) ${progressPct}% 100%)`,
            }}
          >
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: "50%",
                background: "rgba(14,16,24,0.95)",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
              }}
            >
              {progressPct}%
            </div>
          </div>
        </div>
        <div className="cta-row" style={{ marginTop: 2 }}>
          <PremiumButton href="/training/photos">Start Creating My Twin</PremiumButton>
          <PremiumButton href="/dashboard" variant="secondary">
            Set Preferences
          </PremiumButton>
        </div>
        {allStepsDone && requestCount === 0 ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <PremiumButton type="button" onClick={queueFirstJob} loading={queueing}>
              Queue First Generation Job
            </PremiumButton>
            {queueMessage ? <span style={{ color: queueMessage.includes("success") ? "var(--success)" : "var(--danger)" }}>{queueMessage}</span> : null}
          </div>
        ) : null}
      </section>

      <section className="premium-status-grid section">
        {statusCards.map((card, idx) => (
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
            <PremiumCard title={card.title} subtitle={card.description}>
              {"key" in card &&
              (card.key === "preferences" || card.key === "photos" || card.key === "generation") ? (
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
    </div>
  );
}
