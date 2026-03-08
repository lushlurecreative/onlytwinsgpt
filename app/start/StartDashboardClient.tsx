"use client";

import { motion } from "framer-motion";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

type StatusCard = {
  label: string;
  value: string;
  progress: number;
};

export default function StartDashboardClient() {
  const statusCards: StatusCard[] = [
    { label: "Twin Status", value: "Awaiting data intake", progress: 16 },
    { label: "Training Status", value: "Waiting for photo upload", progress: 10 },
    { label: "Generation Queue", value: "No jobs queued", progress: 0 },
    { label: "Recent Activity", value: "System online", progress: 82 },
  ];

  const actionCards = [
    {
      title: "Step 1: Upload Training Photos",
      description: "Start here. Upload high-quality photos so we can begin training your twin model.",
      buttonText: "Start Creating My Twin",
      href: "/training/photos",
    },
    {
      title: "Step 2: Set Preferences",
      description: "Complete onboarding intake so we know your exact style, rules, and generation direction.",
      buttonText: "Set Preferences",
      href: "/onboarding/intake",
    },
    {
      title: "View My Requests",
      description: "Track your training and generation progress.",
      buttonText: "View Status",
      href: "/requests",
    },
    {
      title: "Open My Library",
      description: "View and download your completed images.",
      buttonText: "Open Library",
      href: "/library",
    },
    {
      title: "Account & Billing",
      description: "Manage your plan, email, and billing details.",
      buttonText: "Open Account",
      href: "/billing",
    },
  ];

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
          <PremiumButton href="/onboarding/intake" variant="secondary">
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
            key={card.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: idx * 0.04 }}
          >
            <PremiumCard title={card.title} subtitle={card.description}>
              <PremiumButton href={card.href}>{card.buttonText}</PremiumButton>
            </PremiumCard>
          </motion.div>
        ))}
      </section>
    </div>
  );
}
