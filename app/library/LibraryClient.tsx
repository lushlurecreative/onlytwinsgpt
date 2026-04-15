"use client";

import { useEffect, useState } from "react";

type PostRow = {
  id: string;
  caption: string | null;
  created_at: string;
  signed_url: string | null;
  output_path?: string | null;
};

type RequestRow = {
  id: string;
  scene_preset: string;
  status: string;
  progress_done: number;
  progress_total: number;
  created_at: string;
};

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "rgba(234,179,8,0.12)", text: "#eab308", label: "Pending" },
  approved: { bg: "rgba(59,130,246,0.12)", text: "#3b82f6", label: "Approved" },
  generating: { bg: "rgba(124,58,237,0.15)", text: "#a78bfa", label: "Generating" },
  completed: { bg: "rgba(34,197,94,0.12)", text: "#22c55e", label: "Complete" },
  failed: { bg: "rgba(239,68,68,0.12)", text: "#ef4444", label: "Failed" },
};

export default function LibraryClient() {
  const [rows, setRows] = useState<PostRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [postsRes, requestsRes] = await Promise.all([
        fetch("/api/posts"),
        fetch("/api/generation-requests"),
      ]);
      const postsResult = (await postsRes.json().catch(() => ({}))) as {
        posts?: PostRow[];
        error?: string;
      };
      if (!postsRes.ok) {
        setError(postsResult.error ?? "Could not load your content.");
        setLoading(false);
        return;
      }
      setRows(postsResult.posts ?? []);

      const requestsResult = (await requestsRes.json().catch(() => ({}))) as {
        requests?: RequestRow[];
      };
      setRequests(requestsResult.requests ?? []);
      setLoading(false);
    };
    void load();
  }, []);

  // Poll for active generation requests
  useEffect(() => {
    const hasActive = requests.some(
      (r) => r.status === "pending" || r.status === "approved" || r.status === "generating"
    );
    if (!hasActive) return;
    const interval = setInterval(async () => {
      const [postsRes, requestsRes] = await Promise.all([
        fetch("/api/posts"),
        fetch("/api/generation-requests"),
      ]);
      const postsResult = (await postsRes.json().catch(() => ({}))) as { posts?: PostRow[] };
      if (postsRes.ok) setRows(postsResult.posts ?? []);
      const requestsResult = (await requestsRes.json().catch(() => ({}))) as { requests?: RequestRow[] };
      if (requestsRes.ok) setRequests(requestsResult.requests ?? []);
    }, 10_000);
    return () => clearInterval(interval);
  }, [requests]);

  async function downloadFile(url: string, filename: string) {
    setDownloading(url);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ height: 220, borderRadius: 12, background: "rgba(255,255,255,0.05)", animation: "pulse 1.5s ease-in-out infinite" }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, borderRadius: 12, background: "rgba(229,83,75,0.1)", border: "1px solid rgba(229,83,75,0.3)" }}>
        <p style={{ margin: 0, color: "var(--error, #e5534b)" }}>{error}</p>
      </div>
    );
  }

  // Active requests banner
  const activeRequests = requests.filter(
    (r) => r.status === "pending" || r.status === "approved" || r.status === "generating"
  );

  return (
    <div>
      {/* Active generation status */}
      {activeRequests.length > 0 && (
        <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {activeRequests.map((req) => {
            const cfg = STATUS_COLORS[req.status] ?? STATUS_COLORS.pending;
            const pct = req.progress_total > 0 ? Math.round((req.progress_done / req.progress_total) * 100) : 0;
            return (
              <div
                key={req.id}
                style={{
                  padding: "14px 18px",
                  borderRadius: 12,
                  background: cfg.bg,
                  border: `1px solid ${cfg.text}33`,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 10px",
                    borderRadius: 99,
                    background: cfg.text,
                    color: "#000",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {cfg.label}
                </span>
                <span style={{ fontSize: 14, opacity: 0.85 }}>
                  {req.scene_preset} — {req.progress_done}/{req.progress_total} outputs
                  {req.status === "generating" && ` (${pct}%)`}
                </span>
                {req.status === "generating" && (
                  <div
                    style={{
                      flex: 1,
                      maxWidth: 160,
                      height: 5,
                      borderRadius: 99,
                      background: "rgba(255,255,255,0.1)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        borderRadius: 99,
                        background: cfg.text,
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ padding: 40, borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", textAlign: "center" }}>
          <h3 style={{ margin: "0 0 8px", fontWeight: 600 }}>No content yet</h3>
          <p style={{ margin: 0, opacity: 0.65, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
            Your generated images and videos will appear here once your first batch is complete.
          </p>
        </div>
      ) : (
        <>
          <p style={{ marginBottom: 16, opacity: 0.7, fontSize: 14 }}>
            {rows.length} item{rows.length !== 1 ? "s" : ""} — click any image to download
          </p>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {rows.map((row) => {
              const isVideo = row.signed_url?.includes(".mp4") ?? false;
              const ext = isVideo ? "mp4" : "jpg";
              const filename = `onlytwins-${row.id.slice(0, 8)}.${ext}`;
              const isDownloading = downloading === row.signed_url;

              return (
                <div
                  key={row.id}
                  style={{
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ position: "relative", aspectRatio: "1 / 1", background: "#0a0a0a" }}>
                    {row.signed_url ? (
                      isVideo ? (
                        <video
                          src={row.signed_url}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          controls
                          playsInline
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.signed_url}
                          alt={row.caption ?? "Generated content"}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      )
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.3, fontSize: 13 }}>
                        Preview unavailable
                      </div>
                    )}
                  </div>

                  <div style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, opacity: 0.55 }}>
                      {new Date(row.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    {row.signed_url && (
                      <button
                        type="button"
                        onClick={() => void downloadFile(row.signed_url!, filename)}
                        disabled={isDownloading}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "6px 14px",
                          borderRadius: 99,
                          border: "none",
                          background: isDownloading ? "rgba(124,58,237,0.4)" : "var(--accent, #7c3aed)",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: isDownloading ? "not-allowed" : "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isDownloading ? (
                          "Saving\u2026"
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M6 1v7M3 5.5 6 8.5l3-3M1 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Download
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
