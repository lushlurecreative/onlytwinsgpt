"use client";

import { useEffect, useMemo, useState } from "react";
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
  href: string;
  editHref: string;
};

const steps: SetupStep[] = [
  {
    key: "preferences",
    title: "Step 1: Set Preferences",
    description: "Complete onboarding intake with your identity details, bio, constraints, and style rules.",
    buttonText: "Set Preferences",
    href: "/start",
    editHref: "/onboarding/intake",
  },
  {
    key: "photos",
    title: "Step 2: Upload Training Photos",
    description: "Upload approved training images so we can start model training with clean source data.",
    buttonText: "Upload Photos",
    href: "/training/photos",
    editHref: "/training/photos",
  },
  {
    key: "generation",
    title: "Step 3: Choose Generation Preferences",
    description: "Choose your monthly photo/video mix and exact prompt directions for default generations.",
    buttonText: "Choose Preferences",
    href: "/requests",
    editHref: "/requests",
  },
];

export default function StartDashboardClient() {
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState({
    preferences: false,
    photos: false,
    generation: false,
  });

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

      const intake = intakeJson.intake;
      const prefRows = prefsJson.preferences?.allocationRows ?? [];
      const preferencesDone = !!(
        intake?.name?.trim() &&
        intake?.age?.trim() &&
        intake?.email?.trim() &&
        intake?.whatsapp?.trim() &&
        intake?.realBio?.trim() &&
        intake?.desiredBio?.trim()
      );
      const photosDone = (uploadsJson.files?.length ?? 0) >= 10;
      const generationDone = prefRows.length > 0 && prefRows.some((row) => (row.direction ?? "").trim().length > 0);

      setCompleted({
        preferences: preferencesDone,
        photos: photosDone,
        generation: generationDone,
      });
      setLoading(false);
    };

    void load();
  }, []);

  const completedCount = useMemo(
    () => [completed.preferences, completed.photos, completed.generation].filter(Boolean).length,
    [completed]
  );

  const statusCards: StatusCard[] = [
    {
      label: "Setup Progress",
      value: `${completedCount}/3 steps completed`,
      progress: Math.round((completedCount / 3) * 100),
    },
    {
      label: "Preferences",
      value: completed.preferences ? "Completed" : "Pending",
      progress: completed.preferences ? 100 : 20,
    },
    {
      label: "Training Photos",
      value: completed.photos ? "Completed" : "Pending",
      progress: completed.photos ? 100 : 20,
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

  return (
    <div className="premium-dashboard">
      <section className="premium-hero">
        <p className="eyebrow">AI Control Center</p>
        <h1>Welcome to OnlyTwins</h1>
        <p>
          Your subscription is active. Start by uploading your training photos so we can generate your twin
          images.
        </p>
        <div className="cta-row" style={{ marginTop: 4 }}>
          <PremiumButton href="/training/photos">Start Creating My Twin</PremiumButton>
          <PremiumButton href="/start" variant="secondary">
            Set Preferences
          </PremiumButton>
        </div>
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
                  <PremiumButton href={card.href} variant={completed[card.key] ? "secondary" : "primary"}>
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
