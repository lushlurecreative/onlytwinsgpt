"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PremiumButton from "@/components/PremiumButton";

type MixLine = {
  id: string;
  type: "photo" | "video";
  quantity: number;
  prompt: string;
};

type PlannerResponse = {
  plan: {
    key: string | null;
    name: string;
    status: string;
    billingCadence: string;
    allowance: { photos: number; videos: number };
    nextRenewalAt: string | null;
  };
  timing: {
    cutoffAt: string | null;
    editsApplyTo: "next_cycle" | "following_cycle";
  };
  cycleUsage: {
    photosUsed: number;
    videosUsed: number;
    photosRemaining: number;
    videosRemaining: number;
  };
  recurringMix: {
    updatedAt: string | null;
    appliesTo: "next_cycle" | "following_cycle";
    cutoffAt: string | null;
    nextRenewalAt: string | null;
    cycleEffectiveAt: string | null;
    lines: MixLine[];
  };
};

export default function RequestsClient() {
  const [planner, setPlanner] = useState<PlannerResponse | null>(null);
  const [mixLines, setMixLines] = useState<MixLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedState, setSavedState] = useState<{
    appliesTo?: "next_cycle" | "following_cycle";
    cutoffAt?: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState("");

  const loadPlanner = useCallback(async () => {
    const response = await fetch("/api/me/request-planner");
    const result = (await response.json().catch(() => ({}))) as PlannerResponse & { error?: string };
    if (!response.ok || !result.plan) {
      setError(result.error ?? "Could not load request planner.");
      setLoading(false);
      return;
    }
    setPlanner(result);
    setMixLines(result.recurringMix.lines.length > 0 ? result.recurringMix.lines : [
      { id: crypto.randomUUID(), type: "photo", quantity: 10, prompt: "Gym set with premium studio lighting" },
      { id: crypto.randomUUID(), type: "photo", quantity: 15, prompt: "Bedroom/lifestyle creator shots" },
      { id: crypto.randomUUID(), type: "video", quantity: 5, prompt: "Short social reels with varied camera movement" },
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPlanner();
  }, [loadPlanner]);

  const addRow = () => {
    setMixLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type: "photo", quantity: 1, prompt: "" },
    ]);
  };

  const updateRow = (id: string, patch: Partial<MixLine>) => {
    setMixLines((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    setMixLines((prev) => prev.filter((row) => row.id !== id));
  };

  const totals = useMemo(
    () => ({
      photos: mixLines.filter((line) => line.type === "photo").reduce((sum, line) => sum + line.quantity, 0),
      videos: mixLines.filter((line) => line.type === "video").reduce((sum, line) => sum + line.quantity, 0),
    }),
    [mixLines]
  );

  const canSave =
    !!planner &&
    mixLines.length > 0 &&
    mixLines.every((line) => line.prompt.trim().length > 0) &&
    totals.photos <= planner.plan.allowance.photos &&
    totals.videos <= planner.plan.allowance.videos;
  const overLimit = !!planner && (totals.photos > planner.plan.allowance.photos || totals.videos > planner.plan.allowance.videos);

  async function saveRecurringMix() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    setSaveFeedback("");
    const payload = {
      preset: "custom",
      allocationRows: mixLines.map((line) => ({
        id: line.id,
        kind: line.type,
        count: line.quantity,
        direction: line.prompt,
      })),
    };
    const response = await fetch("/api/me/request-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      appliesTo?: "next_cycle" | "following_cycle";
      cutoffAt?: string | null;
      generationState?: string;
      generationMessage?: string;
    };
    if (!response.ok) {
      setError(result.error ?? "Could not save recurring mix.");
      setSaving(false);
      return;
    }
    setLoading(true);
    setSavedState({ appliesTo: result.appliesTo, cutoffAt: result.cutoffAt });
    setSaveFeedback(result.generationMessage ?? "Your recurring request mix has been saved.");
    setSaving(false);
    await loadPlanner();
  }

  return (
    <div className="planner-stack">
      <article className="premium-card planner-hero">
        <h2 style={{ marginTop: 0 }}>Monthly request planner</h2>
        <p className="planner-copy">
          These requests repeat every month unless updated at least 5 days before renewal.
        </p>
        <p className="planner-copy">
          If changes are made too late, they apply to the following cycle.
        </p>
        <p className="planner-copy" style={{ marginBottom: 0 }}>
          Your next cycle generates fresh content based on your saved recurring request mix.
        </p>
      </article>

      <article className="premium-card planner-hero">
        <h3 style={{ marginTop: 0 }}>How your monthly generation works</h3>
        <p className="planner-copy">
          Your plan includes a fixed monthly number of photos and videos. Each billing cycle, we generate your content
          as a complete batch based on your saved request mix.
        </p>
        <p className="planner-copy">You do not generate single items one-by-one whenever you want.</p>
        <p className="planner-copy">
          If you leave part of your monthly allowance unassigned, OnlyTwins will automatically select the remaining
          scenes and styles for you.
        </p>
        <p className="planner-copy" style={{ marginBottom: 0 }}>
          If you do not update your request mix before the cycle cutoff, your previous mix will repeat for the next
          cycle with newly generated content.
        </p>
      </article>

      {loading ? (
        <section className="planner-summary-grid">
          {Array.from({ length: 3 }).map((_, idx) => (
            <article className="premium-card" key={`requests-skeleton-${idx}`}>
              <div className="skeleton-line w-40" />
              <div className="skeleton-line w-70" />
            </article>
          ))}
        </section>
      ) : (
        <>
          <section className="planner-summary-grid">
            <article className="premium-card">
              <div className="status-label">Current plan</div>
              <div className="status-value">{planner?.plan.name}</div>
              <div className="muted">
                {planner?.plan.allowance.photos} photos + {planner?.plan.allowance.videos} videos / month
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="badge">{planner?.plan.status}</span>
                <span className="badge badge-muted">{planner?.plan.billingCadence}</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <PremiumButton href="/upgrade" variant="secondary">
                  Upgrade plan
                </PremiumButton>
              </div>
            </article>
            <article className="premium-card">
              <div className="status-label">Next renewal date</div>
              <div className="status-value">
                {planner?.plan.nextRenewalAt ? new Date(planner.plan.nextRenewalAt).toLocaleString() : "Unavailable"}
              </div>
              <div className="muted">
                Edits apply to{" "}
                {savedState?.appliesTo === "following_cycle"
                  ? "the following cycle"
                  : planner?.timing.editsApplyTo === "following_cycle"
                    ? "the following cycle"
                    : "the next cycle"}
              </div>
            </article>
            <article className="premium-card">
              <div className="status-label">Upgrade</div>
              <div className="status-value">Need more monthly output?</div>
              <div className="muted">
                You can upgrade your plan anytime. If you upgrade mid-cycle, we automatically apply credit for the unused
                portion of your current plan.
              </div>
              <div style={{ marginTop: 12 }}>
                <PremiumButton href="/upgrade">Upgrade plan</PremiumButton>
              </div>
            </article>
          </section>

          <article className="premium-card planner-config">
            <h3 style={{ marginTop: 0 }}>Remaining this cycle</h3>
            <div className="planner-summary-grid">
              <div>
                <div className="status-label">Photos remaining</div>
                <div className="status-value">
                  {planner?.cycleUsage.photosRemaining}/{planner?.plan.allowance.photos}
                </div>
                <div className="status-progress" style={{ marginTop: 10 }}>
                  <div
                    className="status-progress-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          ((planner?.cycleUsage.photosUsed ?? 0) / Math.max(1, planner?.plan.allowance.photos ?? 1)) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="status-label">Videos remaining</div>
                <div className="status-value">
                  {planner?.cycleUsage.videosRemaining}/{planner?.plan.allowance.videos}
                </div>
                <div className="status-progress" style={{ marginTop: 10 }}>
                  <div
                    className="status-progress-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          ((planner?.cycleUsage.videosUsed ?? 0) / Math.max(1, planner?.plan.allowance.videos ?? 1)) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </article>

          <article className="premium-card planner-config">
            <h3 style={{ marginTop: 0 }}>Recurring monthly mix</h3>
            <p className="planner-copy">
              Build your recurring request mix. The same themes/scenes/styles are regenerated as fresh content every cycle.
            </p>
            <div className="planner-line-items">
              {mixLines.map((line) => (
                <div key={line.id} className="planner-line-item">
                  <select
                    className="input"
                    value={line.type}
                    onChange={(event) => updateRow(line.id, { type: event.target.value as "photo" | "video" })}
                  >
                    <option value="photo">Photo</option>
                    <option value="video">Video</option>
                  </select>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(event) => updateRow(line.id, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                  />
                  <input
                    className="input"
                    value={line.prompt}
                    placeholder="Scene/style prompt"
                    onChange={(event) => updateRow(line.id, { prompt: event.target.value })}
                  />
                  <button type="button" onClick={() => removeRow(line.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-ghost" type="button" onClick={addRow}>
                Add line
              </button>
              <button className="btn btn-primary" type="button" onClick={saveRecurringMix} disabled={!canSave || saving}>
                {saving ? "Saving..." : "Save recurring preferences"}
              </button>
              <PremiumButton href="/upgrade" variant="secondary">
                Upgrade plan
              </PremiumButton>
            </div>
            <div style={{ marginTop: 10, opacity: 0.9 }}>
              Photos selected: {totals.photos} / {planner?.plan.allowance.photos ?? 0}
              {" · "}
              Videos selected: {totals.videos} / {planner?.plan.allowance.videos ?? 0}
            </div>
            {overLimit ? (
              <p style={{ color: "var(--danger)", marginBottom: 0 }}>
                Your current plan includes up to {planner?.plan.allowance.photos ?? 0} photos and{" "}
                {planner?.plan.allowance.videos ?? 0} videos per month. To request more than that, upgrade your plan.
              </p>
            ) : null}
            {overLimit ? (
              <div style={{ marginTop: 10 }}>
                <PremiumButton href="/upgrade">Upgrade plan</PremiumButton>
              </div>
            ) : null}
            {!overLimit && !canSave ? (
              <p style={{ color: "var(--danger)", marginBottom: 0 }}>
                Ensure each line has prompt text before saving.
              </p>
            ) : null}
            {saveFeedback ? (
              <p style={{ color: "var(--success)", marginBottom: 0 }}>{saveFeedback}</p>
            ) : null}
          </article>

          <article className="premium-card">
            <h3 style={{ marginTop: 0 }}>Timing rule notice</h3>
            <p className="planner-copy">
              Updates submitted 5+ days before renewal apply to the next cycle. Later updates apply to the following cycle.
            </p>
            <p className="planner-copy" style={{ marginBottom: 0 }}>
              Renewal cutoff:{" "}
              {savedState?.cutoffAt
                ? new Date(savedState.cutoffAt).toLocaleString()
                : planner?.timing.cutoffAt
                  ? new Date(planner.timing.cutoffAt).toLocaleString()
                  : "Unavailable"}
            </p>
          </article>

          {planner?.recurringMix.lines.length ? (
            <article className="premium-card">
              <h3 style={{ marginTop: 0 }}>Currently saved recurring mix</h3>
              <div className="planner-line-items">
                {planner.recurringMix.lines.map((line) => (
                  <div className="planner-line-item" key={`saved-${line.id}`}>
                    <span className="badge">{line.type}</span>
                    <strong>{line.quantity}</strong>
                    <span>{line.prompt}</span>
                  </div>
                ))}
              </div>
            </article>
          ) : null}
        </>
      )}
      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
    </div>
  );
}
