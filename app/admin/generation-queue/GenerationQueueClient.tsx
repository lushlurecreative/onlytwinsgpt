"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { SCENE_PRESETS, type ScenePresetKey } from "@/lib/scene-presets";

type RequestRow = {
  id: string;
  user_id: string;
  customer_name?: string | null;
  sample_paths: string[];
  output_paths?: string[];
  scene_preset: string;
  content_mode?: "sfw" | "mature";
  image_count: number;
  video_count: number;
  status: string;
  progress_done: number;
  progress_total: number;
  retry_count: number;
  created_at: string;
  updated_at?: string;
  admin_notes: string | null;
};

type SignedAsset = { path: string; signedUrl: string | null; error?: string };
type AssetsResponse = { requestId: string; samples: SignedAsset[]; outputs: SignedAsset[] };
type UploadFile = { path: string; name: string };

type StatusFilter = "pending" | "approved" | "generating" | "failed" | "completed" | "rejected" | "all";

export default function GenerationQueueClient() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assetsById, setAssetsById] = useState<Record<string, AssetsResponse | undefined>>({});
  const [draftById, setDraftById] = useState<
    Record<string, { scene_preset: string; content_mode: "sfw" | "mature"; image_count: number; video_count: number; admin_notes: string }>
  >({});

  // Create request modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createUserId, setCreateUserId] = useState("");
  const [createScene, setCreateScene] = useState<ScenePresetKey>(SCENE_PRESETS[0].key);
  const [createImages, setCreateImages] = useState(10);
  const [createMode, setCreateMode] = useState<"sfw" | "mature">("sfw");
  const [availableUploads, setAvailableUploads] = useState<UploadFile[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/generation-requests");
    const json = (await res.json().catch(() => ({}))) as { requests?: RequestRow[]; error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Failed to load");
      setLoading(false);
      return;
    }
    setRows(json.requests ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const needsPolling = rows.some((r) => r.status === "generating");
    if (!needsPolling) return;
    const t = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(t);
  }, [rows]);

  async function approve(id: string, approved: boolean) {
    setMessage("Updating...");
    const res = await fetch(`/api/admin/generation-requests/${id}/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { setMessage(json.error ?? "Failed"); return; }
    setMessage(approved ? "Approved." : "Rejected.");
    await load();
  }

  async function generateNow(id: string) {
    setMessage("Initiating generation... this runs in the background.");
    const res = await fetch(`/api/admin/generation-requests/${id}/generate`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
    if (!res.ok) { setMessage(json.error ?? "Generation failed"); return; }
    setMessage(`Generation finished — status: ${json.status ?? "done"}`);
    await load();
  }

  async function saveEdits(id: string) {
    const draft = draftById[id];
    if (!draft) return;
    setMessage("Saving...");
    const res = await fetch(`/api/admin/generation-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenePreset: draft.scene_preset,
        contentMode: draft.content_mode,
        imageCount: draft.image_count,
        videoCount: draft.video_count,
        adminNotes: draft.admin_notes || null,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { setMessage(json.error ?? "Failed"); return; }
    setMessage("Saved.");
    await load();
  }

  async function deleteSample(requestId: string, path: string) {
    if (!window.confirm("Remove this sample photo?")) return;
    const res = await fetch(`/api/admin/generation-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeSamplePath: path }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { setMessage(json.error ?? "Failed to remove sample"); return; }
    setAssetsById((prev) => {
      const a = prev[requestId];
      if (!a) return prev;
      return { ...prev, [requestId]: { ...a, samples: a.samples.filter((s) => s.path !== path) } };
    });
    await load();
  }

  async function requestNewPhotos(id: string) {
    if (!window.confirm("Request new photos? Status will reset to pending.")) return;
    const res = await fetch(`/api/admin/generation-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestNewPhotos: true }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { setMessage(json.error ?? "Failed"); return; }
    setMessage("New photos requested.");
    await load();
  }

  async function expand(row: RequestRow) {
    const next = expandedId === row.id ? null : row.id;
    setExpandedId(next);
    if (!next) return;
    setDraftById((prev) => ({
      ...prev,
      [row.id]: prev[row.id] ?? {
        scene_preset: row.scene_preset,
        content_mode: row.content_mode ?? "sfw",
        image_count: row.image_count,
        video_count: row.video_count,
        admin_notes: row.admin_notes ?? "",
      },
    }));
    if (assetsById[row.id]) return;
    const res = await fetch(`/api/admin/generation-requests/${row.id}/assets`);
    const json = (await res.json().catch(() => ({}))) as Partial<AssetsResponse> & { error?: string };
    if (!res.ok) { setMessage(json.error ?? "Failed to load assets"); return; }
    setAssetsById((prev) => ({ ...prev, [row.id]: json as AssetsResponse }));
  }

  async function loadUploadsForUser(uid: string) {
    if (!uid.trim()) return;
    setUploadsLoading(true);
    setAvailableUploads([]);
    setSelectedPaths([]);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/uploads`);
    const json = (await res.json().catch(() => ({}))) as { files?: UploadFile[]; error?: string };
    setUploadsLoading(false);
    if (!res.ok) { setMessage(json.error ?? "Failed to load uploads"); return; }
    setAvailableUploads(json.files ?? []);
  }

  async function createRequest() {
    setCreating(true);
    setMessage("");
    const res = await fetch("/api/admin/generation-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: createUserId,
        scenePreset: createScene,
        imageCount: createImages,
        contentMode: createMode,
        samplePaths: selectedPaths,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { request?: { id: string }; error?: string };
    setCreating(false);
    if (!res.ok) { setMessage(json.error ?? "Failed to create request"); return; }
    setMessage(`Request created — id: ${json.request?.id?.slice(0, 8)}…`);
    setShowCreate(false);
    await load();
  }

  function togglePath(path: string) {
    setSelectedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  }

  const counts = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      acc.byStatus[row.status] = (acc.byStatus[row.status] ?? 0) + 1;
      return acc;
    },
    { total: 0, byStatus: {} as Record<string, number> }
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (!normalizedQuery) return true;
    return [row.id, row.user_id, row.scene_preset, row.customer_name ?? "", row.status]
      .join(" ").toLowerCase().includes(normalizedQuery);
  });

  return (
    <div>
      {/* Create request modal */}
      {showCreate && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div className="card" style={{ maxWidth: 560, width: "100%", margin: 16, padding: 20, maxHeight: "80vh", overflowY: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Create generation request</h3>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span className="muted" style={{ fontSize: 12 }}>Customer ID (user_id)</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    placeholder="Paste user UUID"
                    value={createUserId}
                    onChange={(e) => setCreateUserId(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-ghost" type="button" onClick={() => void loadUploadsForUser(createUserId)}>
                    Load uploads
                  </button>
                </div>
              </label>

              {uploadsLoading && <p className="muted">Loading uploads...</p>}
              {availableUploads.length > 0 && (
                <div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    Select photos to use ({selectedPaths.length} selected)
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                    {availableUploads.map((f) => {
                      const selected = selectedPaths.includes(f.path);
                      return (
                        <button
                          key={f.path}
                          type="button"
                          onClick={() => togglePath(f.path)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: selected ? "2px solid var(--primary, #7c3aed)" : "1px solid var(--border, #444)",
                            background: selected ? "rgba(124,58,237,0.15)" : "transparent",
                            fontSize: 12,
                            cursor: "pointer",
                            color: "inherit",
                          }}
                        >
                          {f.name}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 12, marginTop: 6 }}
                    onClick={() => setSelectedPaths(availableUploads.map((f) => f.path))}
                  >
                    Select all
                  </button>
                </div>
              )}
              {availableUploads.length === 0 && !uploadsLoading && createUserId && (
                <p className="muted" style={{ fontSize: 12 }}>No uploads found. You can still create the request — customer must upload photos first.</p>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Scene</span>
                  <select className="input" value={createScene} onChange={(e) => setCreateScene(e.target.value as ScenePresetKey)}>
                    {SCENE_PRESETS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Content mode</span>
                  <select className="input" value={createMode} onChange={(e) => setCreateMode(e.target.value as "sfw" | "mature")}>
                    <option value="sfw">SFW</option>
                    <option value="mature">Mature</option>
                  </select>
                </label>
              </div>
              <label style={{ display: "grid", gap: 4 }}>
                <span className="muted" style={{ fontSize: 12 }}>Images to generate</span>
                <input className="input" type="number" min={1} max={250} value={createImages} onChange={(e) => setCreateImages(Number(e.target.value))} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={creating || !createUserId.trim()}
                onClick={() => void createRequest()}
              >
                {creating ? "Creating…" : "Create request"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 4 }}>Generation queue</h2>
            <p className="muted" style={{ margin: 0 }}>All generation requests across every customer. Approve, edit, and trigger runs here.</p>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => setShowCreate(true)}>
            + Create request
          </button>
        </div>

        <div className="tabs" style={{ marginTop: 16 }}>
          {(
            [
              ["pending", "Needs review"],
              ["approved", "Approved"],
              ["generating", "Running"],
              ["failed", "Failed"],
              ["completed", "Completed"],
              ["rejected", "Rejected"],
              ["all", "All"],
            ] as const
          ).map(([key, label]) => {
            const n = key === "all" ? counts.total : (counts.byStatus[key] ?? 0);
            return (
              <button
                key={key}
                className={`tab ${statusFilter === key ? "tab-active" : ""}`}
                onClick={() => setStatusFilter(key)}
                type="button"
              >
                {label} <span className="badge badge-muted">{n}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
          <input
            className="input"
            placeholder="Search by customer, scene, ID, status..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 400 }}
          />
          <button className="btn btn-ghost" type="button" onClick={() => void load()}>Refresh</button>
          <span className="muted" style={{ fontSize: 12 }}>
            {filteredRows.length} / {rows.length} shown
          </span>
        </div>
        {message ? <p style={{ marginTop: 8, marginBottom: 0 }}>{message}</p> : null}
        {loading ? <p>Loading...</p> : null}
        {!loading && rows.length === 0 ? <p className="muted">No generation requests found.</p> : null}
      </div>

      {!loading && filteredRows.length > 0 && (
        <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", minWidth: 900 }}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Scene</th>
                <th>Mode</th>
                <th>Images</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isExpanded = expandedId === row.id;
                const draft = draftById[row.id];
                const assets = assetsById[row.id];
                const displayName = row.customer_name?.trim() || row.user_id.slice(0, 8) + "…";
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td style={{ maxWidth: 180 }}>
                        <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
                        <Link href={`/admin/customers/${row.user_id}`} style={{ fontSize: 11 }} className="muted">
                          View customer →
                        </Link>
                      </td>
                      <td>{row.scene_preset}</td>
                      <td>{(row.content_mode ?? "sfw").toUpperCase()}</td>
                      <td>{row.image_count}</td>
                      <td><span className="badge">{row.status}</span></td>
                      <td>{row.progress_done}/{row.progress_total}</td>
                      <td style={{ fontSize: 12 }}>{new Date(row.created_at).toLocaleString()}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="btn btn-ghost" onClick={() => void expand(row)}>
                          {isExpanded ? "Hide" : "Review"}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={10}>
                          <div className="card" style={{ margin: "10px 0" }}>
                            <div className="split" style={{ gap: 14, alignItems: "start" }}>
                              {/* Sample photos */}
                              <div>
                                <h3 style={{ marginTop: 0, marginBottom: 8 }}>Sample photos</h3>
                                {!assets && <p className="muted">Loading signed URLs...</p>}
                                {assets && assets.samples.length === 0 && (
                                  <p className="muted" style={{ fontSize: 13 }}>No sample photos attached — customer must upload before generation can run.</p>
                                )}
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  {(assets?.samples ?? []).map((a) => (
                                    <div key={a.path} className="card" style={{ padding: 6, flex: "1 1 100px", maxWidth: 140 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                        <span className="muted" style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis" }}>
                                          {a.path.split("/").pop()}
                                        </span>
                                        <button
                                          type="button"
                                          className="btn btn-ghost"
                                          style={{ padding: 4, fontSize: 11 }}
                                          onClick={() => void deleteSample(row.id, a.path)}
                                          disabled={row.status === "generating" || row.status === "completed"}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                      {a.signedUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={a.signedUrl} alt="Sample" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 8 }} />
                                      ) : (
                                        <div className="muted" style={{ fontSize: 12 }}>Could not sign</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {(assets?.samples?.length ?? 0) > 0 && row.status !== "generating" && row.status !== "completed" && (
                                  <button type="button" className="btn btn-ghost" style={{ marginTop: 8, fontSize: 13 }} onClick={() => void requestNewPhotos(row.id)}>
                                    Request new photos from creator
                                  </button>
                                )}
                              </div>

                              {/* Edit + actions */}
                              <div>
                                <h3 style={{ marginTop: 0, marginBottom: 8 }}>Review + Edit</h3>
                                {draft && (
                                  <div style={{ display: "grid", gap: 10 }}>
                                    <label>
                                      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Scene preset</div>
                                      <select
                                        className="input"
                                        value={draft.scene_preset}
                                        onChange={(e) => setDraftById((prev) => ({ ...prev, [row.id]: { ...prev[row.id]!, scene_preset: e.target.value as ScenePresetKey } }))}
                                      >
                                        {SCENE_PRESETS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                                      </select>
                                    </label>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                      <label>
                                        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Content mode</div>
                                        <select
                                          className="input"
                                          value={draft.content_mode}
                                          onChange={(e) => setDraftById((prev) => ({ ...prev, [row.id]: { ...prev[row.id]!, content_mode: e.target.value === "mature" ? "mature" : "sfw" } }))}
                                        >
                                          <option value="sfw">SFW</option>
                                          <option value="mature">Mature</option>
                                        </select>
                                      </label>
                                      <label>
                                        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Images</div>
                                        <input
                                          className="input"
                                          type="number"
                                          min={1}
                                          max={250}
                                          value={draft.image_count}
                                          onChange={(e) => setDraftById((prev) => ({ ...prev, [row.id]: { ...prev[row.id]!, image_count: Number(e.target.value) } }))}
                                        />
                                      </label>
                                    </div>
                                    <label>
                                      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Admin notes</div>
                                      <textarea
                                        className="input"
                                        rows={2}
                                        value={draft.admin_notes}
                                        onChange={(e) => setDraftById((prev) => ({ ...prev, [row.id]: { ...prev[row.id]!, admin_notes: e.target.value } }))}
                                      />
                                    </label>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      <button className="btn" type="button" onClick={() => void saveEdits(row.id)}>Save changes</button>
                                      <button
                                        className="btn btn-primary"
                                        type="button"
                                        onClick={() => void approve(row.id, true)}
                                        disabled={row.status !== "pending"}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        className="btn btn-ghost"
                                        type="button"
                                        onClick={() => void approve(row.id, false)}
                                        disabled={row.status !== "pending"}
                                      >
                                        Reject
                                      </button>
                                      <button
                                        className="btn btn-primary"
                                        type="button"
                                        onClick={() => void generateNow(row.id)}
                                        disabled={!(row.status === "approved" || row.status === "failed")}
                                        title={row.status !== "approved" && row.status !== "failed" ? "Approve the request first" : "Run generation now"}
                                      >
                                        Generate now
                                      </button>
                                    </div>
                                    <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                                      Workflow: Approve → Generate now. "Generate now" runs on the server — this may take a few minutes.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Output thumbnails */}
                            {(assets?.outputs?.length ?? 0) > 0 && (
                              <div style={{ marginTop: 14 }}>
                                <h3 style={{ marginTop: 0, marginBottom: 8 }}>Outputs ({assets!.outputs.length})</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                                  {assets!.outputs.map((a) => (
                                    <div key={a.path} className="card" style={{ padding: 4 }}>
                                      {a.signedUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={a.signedUrl} alt="Output" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 8 }} />
                                      ) : (
                                        <div className="muted" style={{ fontSize: 12 }}>Could not sign</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
