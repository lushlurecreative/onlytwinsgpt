"use client";

import { useEffect, useState } from "react";
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
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [error, setError] = useState("");
  const [monthlyPlan, setMonthlyPlan] = useState("45-5");
  const [preset, setPreset] = useState("balanced");
  const [allocationRows, setAllocationRows] = useState<AllocationRow[]>(PRESET_ROWS.balanced);
  const [saved, setSaved] = useState(false);

  const [allowedPhotos, allowedVideos] = monthlyPlan.split("-").map((x) => Number(x));
  const selectedPhotos = allocationRows
    .filter((row) => row.kind === "photo")
    .reduce((sum, row) => sum + row.count, 0);
  const selectedVideos = allocationRows
    .filter((row) => row.kind === "video")
    .reduce((sum, row) => sum + row.count, 0);

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/generation-requests");
      const result = (await response.json().catch(() => ({}))) as {
        requests?: RequestRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Could not load requests.");
        return;
      }
      setRows(result.requests ?? []);
    };
    void load();
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
    const payload = {
      monthlyPlan,
      preset,
      allocationRows,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem("ot_request_allocation_plan_v1", JSON.stringify(payload));
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <article className="premium-card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Generation Allocation Preferences</h2>
        <p style={{ opacity: 0.8 }}>
          Choose a default mix or customize exactly how your monthly photo/video allotment should be used.
        </p>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label>
            Monthly allotment
            <select value={monthlyPlan} onChange={(event) => setMonthlyPlan(event.target.value)} style={{ width: "100%" }}>
              <option value="45-5">45 photos + 5 videos</option>
              <option value="90-15">90 photos + 15 videos</option>
              <option value="200-35">200 photos + 35 videos</option>
            </select>
          </label>
          <label>
            Default generation option
            <select value={preset} onChange={(event) => setPresetRows(event.target.value)} style={{ width: "100%" }}>
              <option value="balanced">Balanced (gym/bedroom/nsfw mix)</option>
              <option value="social">Social-first (instagram/tiktok mix)</option>
              <option value="custom">Custom starting template</option>
            </select>
          </label>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {allocationRows.map((row) => (
            <div
              key={row.id}
              style={{ display: "grid", gap: 8, gridTemplateColumns: "120px 90px 1fr auto", alignItems: "center" }}
            >
              <select value={row.kind} onChange={(event) => updateRow(row.id, { kind: event.target.value as "photo" | "video" })}>
                <option value="photo">Photo</option>
                <option value="video">Video</option>
              </select>
              <input
                type="number"
                min={1}
                value={row.count}
                onChange={(event) => updateRow(row.id, { count: Math.max(1, Number(event.target.value) || 1) })}
              />
              <input
                placeholder='Direction or custom prompt (example: "10 with purple hair on the beach")'
                value={row.direction}
                onChange={(event) => updateRow(row.id, { direction: event.target.value })}
              />
              <button type="button" onClick={() => removeRow(row.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={addRow}>
            Add line item
          </button>
          <button type="button" onClick={savePlan}>
            Save preferences
          </button>
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

      {rows.length === 0 ? (
        <article className="premium-card" style={{ padding: 18 }}>
          <p style={{ margin: 0, opacity: 0.8 }}>
            No requests yet. Upload training photos first, then complete onboarding preferences to queue your
            first run.
          </p>
        </article>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((row, idx) => (
            <motion.article
              key={row.id}
              className="premium-card"
              style={{ padding: 14 }}
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
