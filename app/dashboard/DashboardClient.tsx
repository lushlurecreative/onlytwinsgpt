"use client";

import { useEffect, useMemo, useState } from "react";
import PremiumButton from "@/components/PremiumButton";

export default function DashboardClient() {
  const INTAKE_LOCAL_KEY = "ot_onboarding_intake_v1";
  const PREFS_LOCAL_KEY = "ot_request_allocation_plan_v1";

  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState({
    preferences: false,
    photos: false,
    generation: false,
  });
  const [samplePaths, setSamplePaths] = useState<string[]>([]);
  const [planLabel, setPlanLabel] = useState("Unknown");
  const [latestBatchStatus, setLatestBatchStatus] = useState("No batch queued");
  const [trainingStatus, setTrainingStatus] = useState("Not started");
  const [activeModelVersion, setActiveModelVersion] = useState<number | null>(null);
  const [modelCount, setModelCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [intakeRes, uploadsRes, prefsRes, entitlementsRes, requestsRes, trainingStatusRes] = await Promise.all([
        fetch("/api/me/onboarding-intake"),
        fetch("/api/uploads"),
        fetch("/api/me/request-preferences"),
        fetch("/api/me/entitlements"),
        fetch("/api/generation-requests"),
        fetch("/api/training/status"),
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
          planName?: string;
        } | null;
      };
      const requestsJson = (await requestsRes.json().catch(() => ({}))) as {
        requests?: Array<{ status?: string }>;
      };
      const trainingJson = (await trainingStatusRes.json().catch(() => ({}))) as {
        modelReady?: boolean;
        trainingStatus?: string | null;
        latestJob?: { status?: string } | null;
        activeModel?: { version?: number } | null;
        modelHistory?: Array<{ id: string; version: number; status: string }>;
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
      setSamplePaths(files.map((file) => file.objectPath));

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
        setPlanLabel("Starter");
      } else if (entitlementPlan === "professional") {
        setPlanLabel("Growth");
      } else if (entitlementPlan === "elite") {
        setPlanLabel("Scale");
      } else {
        setPlanLabel(entitlementsJson.entitlements?.planName ?? "Unknown");
      }
      const latestStatus = String(requestsJson.requests?.[0]?.status ?? "");
      if (latestStatus === "pending") setLatestBatchStatus("Awaiting review");
      else if (latestStatus === "approved") setLatestBatchStatus("Approved — generating soon");
      else if (latestStatus === "generating") setLatestBatchStatus("Generating now");
      else if (latestStatus === "completed") setLatestBatchStatus("Completed");
      else if (latestStatus === "failed") setLatestBatchStatus("Failed — contact support");
      else if (latestStatus === "rejected") setLatestBatchStatus("Not approved — contact support");
      else setLatestBatchStatus("No batch queued");

      // Training status
      if (trainingJson.modelReady) {
        setTrainingStatus("Model ready");
      } else if (trainingJson.latestJob?.status === "running" || trainingJson.trainingStatus === "training") {
        setTrainingStatus("Training in progress");
      } else if (trainingJson.latestJob?.status === "pending" || trainingJson.trainingStatus === "pending") {
        setTrainingStatus("Training queued");
      } else if (trainingJson.latestJob?.status === "failed" || trainingJson.trainingStatus === "failed") {
        setTrainingStatus("Training failed");
      } else {
        setTrainingStatus("Not started");
      }

      // Model version info
      setActiveModelVersion(trainingJson.activeModel?.version ?? null);
      setModelCount(trainingJson.modelHistory?.length ?? 0);

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

  const topAction = useMemo(() => {
    if (!completed.preferences) return { href: "/onboarding/intake", label: "Continue setup" };
    if (!completed.photos) return { href: "/upload", label: "Upload photos" };
    if (!completed.generation) return { href: "/requests", label: "Choose generation preferences" };
    return { href: "/requests", label: "View my requests" };
  }, [completed]);

  return (
    <div className="dashboard-clean-shell">
      <section className="dashboard-clean-summary">
        <div>
          <h1>Welcome to your AI control center</h1>
          <p>Set up your profile, upload training photos, and choose your monthly generation preferences.</p>
          <div className="dashboard-summary-pills">
            <span className="dashboard-inline-pill">Profile: {completed.preferences ? "Complete" : "Incomplete"}</span>
            <span className="dashboard-inline-pill">Training photos: {samplePaths.length} uploaded</span>
            <span className="dashboard-inline-pill">Model: {trainingStatus}{activeModelVersion ? ` (v${activeModelVersion})` : ""}</span>
            <span className="dashboard-inline-pill">Plan: {planLabel}</span>
            <span className="dashboard-inline-pill">Batch: {latestBatchStatus}</span>
          </div>
        </div>
        <div>
          <PremiumButton href={topAction.href}>{topAction.label}</PremiumButton>
        </div>
      </section>

      {loading ? (
        <section className="dashboard-steps-grid">
          <article className="dashboard-step-card">Loading setup...</article>
          <article className="dashboard-step-card">Loading setup...</article>
          <article className="dashboard-step-card">Loading setup...</article>
        </section>
      ) : (
        <section className="dashboard-steps-grid">
          <article className="dashboard-step-card">
            <h3>Step 1: Complete Profile</h3>
            <p>Add your identity, contact, and style details so your twin is set up correctly.</p>
            <PremiumButton href="/onboarding/intake">{completed.preferences ? "View" : "Complete profile"}</PremiumButton>
            <div className="dashboard-step-footer">
              <span className="dashboard-status-pill">{completed.preferences ? "Complete" : "Incomplete"}</span>
            </div>
          </article>

          <article className="dashboard-step-card">
            <h3>Step 2: Upload Training Photos</h3>
            <p>Upload approved source images so we can train your twin with clean, high-quality data.</p>
            <PremiumButton href="/upload">{completed.photos ? "View" : "Upload photos"}</PremiumButton>
            <div className="dashboard-step-footer">
              <span className="dashboard-status-pill">{completed.photos ? "Complete" : "Incomplete"}</span>
            </div>
          </article>

          <article className="dashboard-step-card">
            <h3>Step 3: Set Generation Preferences</h3>
            <p>Choose your recurring monthly photo and video mix, themes, and content direction.</p>
            <PremiumButton href="/requests">{completed.generation ? "View" : "Set preferences"}</PremiumButton>
            <div className="dashboard-step-footer">
              <span className="dashboard-status-pill">{completed.generation ? "Complete" : "Incomplete"}</span>
            </div>
          </article>
        </section>
      )}

      <section className="dashboard-secondary-grid">
        <article className="dashboard-secondary-card">
          <h3>My requests</h3>
          <p>Track your recurring mix, current cycle usage, and request status.</p>
          <PremiumButton href="/requests">View requests</PremiumButton>
        </article>

        <article className="dashboard-secondary-card">
          <h3>Content library</h3>
          <p>View and download completed photos and videos as they are delivered.</p>
          <PremiumButton href="/library">Open library</PremiumButton>
        </article>
      </section>
    </div>
  );
}
