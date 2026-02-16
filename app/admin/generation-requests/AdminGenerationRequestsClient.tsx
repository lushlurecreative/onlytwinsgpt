"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { Fragment, useEffect, useState } from "react";
import { SCENE_PRESETS, type ScenePresetKey } from "@/lib/scene-presets";

type RequestRow = {
  id: string;
  user_id: string;
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

export default function AdminGenerationRequestsClient() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "approved" | "generating" | "failed" | "completed" | "rejected" | "all"
  >("pending");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assetsById, setAssetsById] = useState<Record<string, AssetsResponse | undefined>>({});
  const [draftById, setDraftById] = useState<
    Record<
      string,
      {
        scene_preset: string;
        content_mode: "sfw" | "mature";
        image_count: number;
        video_count: number;
        admin_notes: string;
      }
    >
  >({});

  async function load() {
    const res = await fetch("/api/admin/generation-requests");
    const json = (await res.json().catch(() => ({}))) as { requests?: RequestRow[]; error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Failed to load requests");
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
    if (!res.ok) {
      setMessage(json.error ?? "Failed");
      return;
    }
    setMessage(approved ? "Approved." : "Rejected.");
    await load();
  }

  async function generateNow(id: string) {
    setMessage("Generating...");
    const res = await fetch(`/api/admin/generation-requests/${id}/generate`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Generation failed");
      return;
    }
    setMessage(`Generation run finished (${json.status ?? "done"}).`);
    await load();
  }

  async function expand(row: RequestRow) {
    const next = expandedId === row.id ? null : row.id;
    setExpandedId(next);
    if (!next) return;

    setDraftById((prev) => ({
      ...prev,
      [row.id]:
        prev[row.id] ??
        ({
          scene_preset: row.scene_preset,
          content_mode: row.content_mode ?? "sfw",
          image_count: row.image_count,
          video_count: row.video_count,
          admin_notes: row.admin_notes ?? "",
        } as const),
    }));

    if (assetsById[row.id]) return;
    const res = await fetch(`/api/admin/generation-requests/${row.id}/assets`);
    const json = (await res.json().catch(() => ({}))) as Partial<AssetsResponse> & { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Failed to load signed URLs");
      return;
    }
    setAssetsById((prev) => ({ ...prev, [row.id]: json as AssetsResponse }));
  }

  async function deleteSample(requestId: string, path: string) {
    if (!window.confirm("Remove this sample photo from the request? Creator will need to re-upload if you need replacements."))
      return;
    setMessage("Removing sample...");
    const res = await fetch(`/api/admin/generation-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeSamplePath: path }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Failed to remove sample");
      return;
    }
    setMessage("Sample removed.");
    setAssetsById((prev) => {
      const a = prev[requestId];
      if (!a) return prev;
      return {
        ...prev,
        [requestId]: {
          ...a,
          samples: a.samples.filter((s) => s.path !== path),
        },
      };
    });
    await load();
  }

  async function requestNewPhotos(id: string) {
    if (!window.confirm("Request new photos from the creator? Status will reset to pending.")) return;
    setMessage("Requesting new photos...");
    const res = await fetch(`/api/admin/generation-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestNewPhotos: true }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Failed");
      return;
    }
    setMessage("New photos requested. Creator will see the note in Vault.");
    await load();
  }

  async function saveEdits(id: string) {
    const draft = draftById[id];
    if (!draft) return;
    setMessage("Saving changes...");
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
    const json = (await res.json().catch(() => ({}))) as { error?: string; request?: RequestRow };
    if (!res.ok) {
      setMessage(json.error ?? "Failed to save");
      return;
    }
    setMessage("Saved.");
    await load();
  }

  const counts = rows.reduce(
    (acc, row) => {
      const key = String(row.status || "unknown");
      acc.total += 1;
      acc.byStatus[key] = (acc.byStatus[key] ?? 0) + 1;
      return acc;
    },
    { total: 0, byStatus: {} as Record<string, number> }
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      row.id,
      row.user_id,
      row.scene_preset,
      row.content_mode ?? "",
      row.status,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Generation Requests</h2>
        <p className="muted">This is your primary admin workflow: review samples, approve, generate.</p>
        <div className="tabs" style={{ marginTop: 10 }}>
          {(
            [
              ["pending", "Needs review"],
              ["approved", "Approved"],
              ["generating", "Generating"],
              ["failed", "Failed"],
              ["completed", "Completed"],
              ["rejected", "Rejected"],
              ["all", "All"],
            ] as const
          ).map(([key, label]) => {
            const n = key === "all" ? counts.total : counts.byStatus[key] ?? 0;
            const active = statusFilter === key;
            return (
              <button
                key={key}
                className={`tab ${active ? "tab-active" : ""}`}
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
            placeholder="Search by user id, request id, scene, status..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 520 }}
          />
          <button className="btn btn-ghost" onClick={() => void load()} type="button">
            Refresh
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Showing <strong>{filteredRows.length}</strong> / {rows.length}
          </span>
        </div>
        {message ? <p>{message}</p> : null}
        {loading ? <p>Loading...</p> : null}
        {!loading && rows.length === 0 ? <p>No requests yet.</p> : null}
      </div>

      {!loading && rows.length > 0 ? (
        <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", minWidth: 980 }}>
            <thead>
              <tr>
                <th>Images</th>
                <th>Status</th>
                <th>Progress</th>
                <th>User</th>
                <th>Scene</th>
                <th>Mode</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isExpanded = expandedId === row.id;
                const draft = draftById[row.id];
                const assets = assetsById[row.id];
                return (
                  <Fragment key={row.id}>
                    <tr key={row.id}>
                      <td>{row.image_count}</td>
                      <td>
                        <span className="badge">{row.status}</span>
                      </td>
                      <td>
                        {row.progress_done}/{row.progress_total}
                      </td>
                      <td>
                        <code>{row.user_id}</code>
                      </td>
                      <td>{row.scene_preset}</td>
                      <td>{(row.content_mode ?? "sfw").toUpperCase()}</td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="btn btn-ghost" onClick={() => void expand(row)}>
                          {isExpanded ? "Hide" : "Review"}
                        </button>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr>
                        <td colSpan={10}>
                          <div className="card" style={{ margin: "10px 0" }}>
                            <div className="split" style={{ gap: 14, alignItems: "start" }}>
                              <div>
                                <h3 style={{ marginTop: 0, marginBottom: 8 }}>Samples</h3>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  {(assets?.samples ?? []).map((a) => (
                                    <div key={a.path} className="card" style={{ padding: 6, flex: "1 1 100px", maxWidth: 140 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                        <span className="muted" style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis" }}>{a.path.split("/").pop()}</span>
                                        <button
                                          type="button"
                                          className="btn btn-ghost"
                                          style={{ padding: 4, fontSize: 11 }}
                                          onClick={() => void deleteSample(row.id, a.path)}
                                          disabled={row.status === "generating" || row.status === "completed"}
                                          title="Remove this sample"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                      {a.signedUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={a.signedUrl}
                                          alt="Sample"
                                          style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 8 }}
                                        />
                                      ) : (
                                        <div className="muted" style={{ fontSize: 12 }}>
                                          Could not sign
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {!assets ? <p className="muted">Loading signed URLs...</p> : null}
                                {(assets?.samples?.length ?? 0) > 0 && row.status !== "generating" && row.status !== "completed" ? (
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    style={{ marginTop: 8, fontSize: 13 }}
                                    onClick={() => void requestNewPhotos(row.id)}
                                    title="Request new training photos from creator"
                                  >
                                    Request new photos from creator
                                  </button>
                                ) : null}
                              </div>

                              <div>
                                <h3 style={{ marginTop: 0, marginBottom: 8 }}>Review + Edit</h3>
                                {draft ? (
                                  <div style={{ display: "grid", gap: 10 }}>
                                    <label>
                                      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                                        Scene preset
                                      </div>
                                      <select
                                        className="input"
                                        value={draft.scene_preset}
                                        onChange={(e) =>
                                          setDraftById((prev) => ({
                                            ...prev,
                                            [row.id]: { ...prev[row.id]!, scene_preset: e.target.value as ScenePresetKey },
                                          }))
                                        }
                                      >
                                        {SCENE_PRESETS.map((s) => (
                                          <option key={s.key} value={s.key}>
                                            {s.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                      <label>
                                        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                                          Content mode
                                        </div>
                                        <select
                                          className="input"
                                          value={draft.content_mode}
                                          onChange={(e) =>
                                            setDraftById((prev) => ({
                                              ...prev,
                                              [row.id]: {
                                                ...prev[row.id]!,
                                                content_mode: e.target.value === "mature" ? "mature" : "sfw",
                                              },
                                            }))
                                          }
                                        >
                                          <option value="sfw">SFW</option>
                                          <option value="mature">Mature (non-explicit)</option>
                                        </select>
                                      </label>
                                      <label>
                                        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                                          Images
                                        </div>
                                        <input
                                          className="input"
                                          type="number"
                                          min={1}
                                          max={50}
                                          value={draft.image_count}
                                          onChange={(e) =>
                                            setDraftById((prev) => ({
                                              ...prev,
                                              [row.id]: { ...prev[row.id]!, image_count: Number(e.target.value) },
                                            }))
                                          }
                                        />
                                      </label>
                                    </div>

                                    <details className="card" style={{ padding: 10 }}>
                                      <summary style={{ cursor: "pointer", fontWeight: 800 }}>
                                        Advanced (videos + notes)
                                      </summary>
                                      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                                        <label>
                                          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                                            Videos requested
                                          </div>
                                          <input
                                            className="input"
                                            type="number"
                                            min={0}
                                            max={10}
                                            value={draft.video_count}
                                            onChange={(e) =>
                                              setDraftById((prev) => ({
                                                ...prev,
                                                [row.id]: { ...prev[row.id]!, video_count: Number(e.target.value) },
                                              }))
                                            }
                                          />
                                        </label>

                                        <label>
                                          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                                            Admin notes
                                          </div>
                                          <textarea
                                            className="input"
                                            rows={3}
                                            value={draft.admin_notes}
                                            onChange={(e) =>
                                              setDraftById((prev) => ({
                                                ...prev,
                                                [row.id]: { ...prev[row.id]!, admin_notes: e.target.value },
                                              }))
                                            }
                                          />
                                        </label>
                                      </div>
                                    </details>

                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      <button className="btn" onClick={() => void saveEdits(row.id)}>
                                        Save changes
                                      </button>
                                      <button
                                        className="btn btn-primary"
                                        onClick={() => void approve(row.id, true)}
                                        disabled={row.status !== "pending"}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        className="btn btn-ghost"
                                        onClick={() => void approve(row.id, false)}
                                        disabled={row.status !== "pending"}
                                      >
                                        Reject
                                      </button>
                                      <button
                                        className="btn btn-primary"
                                        onClick={() => void generateNow(row.id)}
                                        disabled={!(row.status === "approved" || row.status === "failed")}
                                        title="Starts LoRA training and image generation"
                                      >
                                        Initialize training
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            {(assets?.outputs?.length ?? 0) > 0 ? (
                              <div style={{ marginTop: 14 }}>
                                <h3 style={{ marginTop: 0, marginBottom: 8 }}>Outputs</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
                                  {assets!.outputs.map((a) => (
                                    <div key={a.path} className="card" style={{ padding: 6 }}>
                                      {a.signedUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={a.signedUrl}
                                          alt="Output"
                                          style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 10 }}
                                        />
                                      ) : (
                                        <div className="muted" style={{ fontSize: 12 }}>
                                          Could not sign
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

