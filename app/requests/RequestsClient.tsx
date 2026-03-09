"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

type RequestRow = {
  id: string;
  status: string;
  progress_done: number;
  progress_total: number;
  created_at: string;
  scene_preset: string;
};

type AllocationRow = {
  id: string;
  kind: "photo" | "video";
  count: number;
  direction: string;
};

type EntitlementResponse = {
  entitlements?: {
    planKey: string;
    imageLimit?: number;
    videoLimit?: number;
  } | null;
};

type RequestPreferencesResponse = {
  preferences?: {
    monthlyPlan?: string;
    preset?: string;
    allocationRows?: AllocationRow[];
  } | null;
};

const PRESET_ROWS: Record<string, AllocationRow[]> = {
  balanced: [
    { id: "a1", kind: "photo", count: 10, direction: "Gym" },
    { id: "a2", kind: "photo", count: 15, direction: "Bedroom" },
    { id: "a3", kind: "photo", count: 20, direction: "NSFW" },
    { id: "a4", kind: "video", count: 5, direction: "Mixed social clips" },
  ],
  social: [
    { id: "b1", kind: "photo", count: 20, direction: "Instagram lifestyle" },
    { id: "b2", kind: "photo", count: 15, direction: "Travel + vacation" },
    { id: "b3", kind: "photo", count: 10, direction: "Fitness and gym" },
    { id: "b4", kind: "video", count: 5, direction: "TikTok short videos" },
  ],
  custom: [{ id: "c1", kind: "photo", count: 10, direction: "10 with purple hair on the beach" }],
};

export default function RequestsClient() {
  const LOCAL_KEY = "ot_request_allocation_plan_v1";
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [error, setError] = useState("");
  const [entitlementPlan, setEntitlementPlan] = useState<string>("45-5");
  const [entitlementLabel, setEntitlementLabel] = useState("your package");
  const [monthlyPlan, setMonthlyPlan] = useState("45-5");
  const [preset, setPreset] = useState("balanced");
  const [allocationRows, setAllocationRows] = useState<AllocationRow[]>(PRESET_ROWS.balanced);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [hasSavedPreferences, setHasSavedPreferences] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const [allowedPhotos, allowedVideos] = monthlyPlan.split("-").map((x) => Number(x));
  const selectedPhotos = allocationRows
    .filter((row) => row.kind === "photo")
    .reduce((sum, row) => sum + row.count, 0);
  const selectedVideos = allocationRows
    .filter((row) => row.kind === "video")
    .reduce((sum, row) => sum + row.count, 0);

  useEffect(() => {
    const loadEntitlements = async () => {
      const response = await fetch("/api/me/entitlements");
      const result = (await response.json().catch(() => ({}))) as EntitlementResponse;
      const planKey = result.entitlements?.planKey ?? "";
      if (planKey === "starter") {
        setEntitlementPlan("45-5");
        setMonthlyPlan("45-5");
        setEntitlementLabel("Starter (45 photos + 5 videos)");
      } else if (planKey === "professional") {
        setEntitlementPlan("90-15");
        setMonthlyPlan("90-15");
        setEntitlementLabel("Professional (90 photos + 15 videos)");
      } else if (planKey === "elite") {
        setEntitlementPlan("200-35");
        setMonthlyPlan("200-35");
        setEntitlementLabel("Elite (200 photos + 35 videos)");
      } else {
        setEntitlementPlan("45-5");
        setMonthlyPlan("45-5");
        setEntitlementLabel("Current package");
      }
    };

    const loadSavedPreferences = async () => {
      let loadedFromLocal = false;
      try {
        const raw = window.localStorage.getItem(LOCAL_KEY);
        if (raw) {
          const local = JSON.parse(raw) as {
            monthlyPlan?: string;
            preset?: string;
            allocationRows?: AllocationRow[];
          };
          if (typeof local.preset === "string") setPreset(local.preset);
          if (Array.isArray(local.allocationRows) && local.allocationRows.length > 0) {
            setAllocationRows(local.allocationRows);
            setHasSavedPreferences(true);
            loadedFromLocal = true;
          }
        }
      } catch {}

      const response = await fetch("/api/me/request-preferences");
      const result = (await response.json().catch(() => ({}))) as RequestPreferencesResponse;
      const savedPrefs = result.preferences;
      if (!savedPrefs) return;
      if (!loadedFromLocal && typeof savedPrefs.preset === "string") setPreset(savedPrefs.preset);
      if (!loadedFromLocal && Array.isArray(savedPrefs.allocationRows) && savedPrefs.allocationRows.length > 0) {
        setAllocationRows(savedPrefs.allocationRows);
        setHasSavedPreferences(true);
      }
    };

    const load = async () => {
      const response = await fetch("/api/generation-requests");
      const result = (await response.json().catch(() => ({}))) as {
        requests?: RequestRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Could not load requests.");
        setLoadingRequests(false);
        return;
      }
      setRows(result.requests ?? []);
      setLoadingRequests(false);
    };
    void (async () => {
      await Promise.allSettled([loadEntitlements(), loadSavedPreferences(), load()]);
      setHydrating(false);
    })();
  }, []);

  const setPresetRows = (key: string) => {
    setPreset(key);
    const source = PRESET_ROWS[key] ?? PRESET_ROWS.custom;
    setAllocationRows(source.map((row) => ({ ...row, id: crypto.randomUUID() })));
  };

  const addRow = () => {
    setAllocationRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "photo", count: 1, direction: "" },
    ]);
  };

  const updateRow = (id: string, patch: Partial<AllocationRow>) => {
    setAllocationRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    setAllocationRows((prev) => prev.filter((row) => row.id !== id));
  };

  const savePlan = () => {
    if (monthlyPlan !== entitlementPlan) return;
    const payload = {
      monthlyPlan,
      preset,
      allocationRows,
    };
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
    } catch {}
    void (async () => {
      const response = await fetch("/api/me/request-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) return;
      setHasSavedPreferences(true);
      setIsEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    })();
  };

  const readOnly = hasSavedPreferences && !isEditing;
  const allocationHealth = useMemo(() => {
    if (selectedPhotos === allowedPhotos && selectedVideos === allowedVideos) return "balanced";
    return "needs_attention";
  }, [selectedPhotos, selectedVideos, allowedPhotos, allowedVideos]);

  return (
    <div className="planner-stack">
      <article className="premium-card planner-hero">
        <h2 style={{ marginTop: 0 }}>AI Generation Planning Console</h2>
        <p className="planner-copy">
          Choose a default mix or customize exactly how your monthly photo/video allotment should be used. You
          can type your own directions in every text box.
        </p>
        <p className="planner-copy">
          Monthly plans repeat the same saved allocation each cycle unless you update preferences at least 5
          days before your next generation cycle.
        </p>
        <p className="planner-copy" style={{ marginBottom: 0 }}>
          Generation delivery target: 2 days after request submission.
        </p>
      </article>

      <section className="planner-summary-grid">
        {hydrating ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <article className="premium-card" key={`planner-summary-skeleton-${idx}`}>
              <div className="skeleton-line w-30" />
              <div className="skeleton-line w-70" />
              <div className="skeleton-line w-50" />
            </article>
          ))
        ) : (
          <>
            <article className="premium-card">
              <div className="status-label">Current plan</div>
              <div className="status-value">{entitlementLabel}</div>
              <div className="muted">Auto-locked from active subscription</div>
            </article>
            <article className="premium-card">
              <div className="status-label">Allocation health</div>
              <div className="status-value">{allocationHealth === "balanced" ? "Balanced" : "Needs attention"}</div>
              <div className="muted">
                {selectedPhotos}/{allowedPhotos} photos · {selectedVideos}/{allowedVideos} videos
              </div>
            </article>
            <article className="premium-card">
              <div className="status-label">Saved profile</div>
              <div className="status-value">{hasSavedPreferences ? "Saved and reusable" : "Draft not saved"}</div>
              <div className="muted">Use edit mode anytime to refine next cycle</div>
            </article>
          </>
        )}
      </section>

      <article className="premium-card planner-config">
        <h3 style={{ marginTop: 0 }}>Configure monthly output mix</h3>

        <div className="planner-config-grid">
          <label className="wizard-label">
            Monthly allotment
            <select
              className="input"
              value={monthlyPlan}
              onChange={(event) => setMonthlyPlan(event.target.value)}
              disabled
            >
              <option value="45-5">45 photos + 5 videos</option>
              <option value="90-15">90 photos + 15 videos</option>
              <option value="200-35">200 photos + 35 videos</option>
            </select>
            <small style={{ display: "block", marginTop: 6, opacity: 0.75 }}>
              Auto-filled from {entitlementLabel}.
            </small>
            <small style={{ display: "block", marginTop: 4, opacity: 0.75 }}>
              Need a different allotment? Upgrade your plan in Billing.
            </small>
          </label>
          <label className="wizard-label">
            Default generation option
            <div className="preset-segments">
              {[
                { key: "balanced", label: "Balanced" },
                { key: "social", label: "Social-first" },
                { key: "custom", label: "Custom" },
              ].map((presetOpt) => (
                <button
                  key={presetOpt.key}
                  type="button"
                  className={`tab ${preset === presetOpt.key ? "tab-active" : ""}`.trim()}
                  onClick={() => setPresetRows(presetOpt.key)}
                  disabled={readOnly}
                >
                  {presetOpt.label}
                </button>
              ))}
            </div>
          </label>
        </div>
        {monthlyPlan !== entitlementPlan ? (
          <p style={{ color: "var(--danger)", marginTop: 8 }}>
            This allotment is above your current package. Upgrade your subscription in Billing to use this
            amount.
          </p>
        ) : null}

        <div className="planner-line-items">
          {allocationRows.map((row) => (
            <div
              key={row.id}
              className="planner-line-item"
            >
              <select
                className="input"
                value={row.kind}
                onChange={(event) => updateRow(row.id, { kind: event.target.value as "photo" | "video" })}
                disabled={readOnly}
              >
                <option value="photo">Photo</option>
                <option value="video">Video</option>
              </select>
              <input
                className="input"
                type="number"
                min={1}
                value={row.count}
                onChange={(event) => updateRow(row.id, { count: Math.max(1, Number(event.target.value) || 1) })}
                disabled={readOnly}
              />
              <input
                className="input"
                placeholder='Direction or custom prompt (example: "10 with purple hair on the beach")'
                value={row.direction}
                onChange={(event) => updateRow(row.id, { direction: event.target.value })}
                disabled={readOnly}
              />
              <button type="button" onClick={() => removeRow(row.id)} disabled={readOnly}>
                Delete
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-ghost" type="button" onClick={addRow} disabled={readOnly}>
            Add line item
          </button>
          {readOnly ? (
            <button className="btn btn-secondary" type="button" onClick={() => setIsEditing(true)}>
              Edit preferences
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={savePlan} disabled={monthlyPlan !== entitlementPlan}>
              {hasSavedPreferences ? "Re-save preferences" : "Save preferences"}
            </button>
          )}
          {readOnly ? <span className="badge">Completed</span> : null}
          {saved ? <span style={{ color: "var(--success)" }}>Saved.</span> : null}
        </div>

        <div style={{ marginTop: 10, opacity: 0.9 }}>
          Selected: {selectedPhotos}/{allowedPhotos} photos and {selectedVideos}/{allowedVideos} videos.
        </div>
        {selectedPhotos !== allowedPhotos || selectedVideos !== allowedVideos ? (
          <p style={{ color: "var(--danger)", marginBottom: 0 }}>
            Your allocation does not match your selected monthly allotment yet. Adjust counts until totals match.
          </p>
        ) : null}
      </article>

      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}

      {loadingRequests || hydrating ? (
        <article className="premium-card">
          <div className="skeleton-line w-40" />
          <div className="skeleton-line w-80" />
          <div className="skeleton-line w-60" />
        </article>
      ) : rows.length === 0 ? (
        <article className="premium-card">
          <div className="empty-visual">P</div>
          <h3 style={{ marginTop: 0 }}>No generation requests yet</h3>
          <p className="planner-copy" style={{ margin: 0 }}>
            Upload training photos first, then save your allocation profile to queue your first premium run.
          </p>
        </article>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((row, idx) => (
            <motion.article
              key={row.id}
              className="premium-card planner-status-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: idx * 0.04 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <strong>{row.scene_preset}</strong>
                <span className="badge">{row.status}</span>
              </div>
              <div style={{ marginTop: 6, opacity: 0.85 }}>
                Progress: {row.progress_done}/{row.progress_total}
              </div>
              <div className="status-progress" style={{ marginTop: 8 }}>
                <motion.div
                  className="status-progress-fill"
                  initial={{ width: 0 }}
                  animate={{
                    width:
                      row.progress_total > 0
                        ? `${Math.min(100, Math.max(0, (row.progress_done / row.progress_total) * 100))}%`
                        : "0%",
                  }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                />
              </div>
              <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>
                {new Date(row.created_at).toLocaleString()}
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  );
}
