"use client";

/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */

import { Fragment, useEffect, useState } from "react";

type LeadRow = {
  id: string;
  source: string;
  handle: string;
  platform: string;
  follower_count: number;
  engagement_rate: number;
  luxury_tag_hits: number;
  score: number;
  status: string;
  profile_url: string | null;
  profile_urls?: Record<string, string>;
  platforms_found?: string[];
  content_verticals?: string[];
  notes: string | null;
  sample_preview_path: string | null;
  sample_paths: string[];
  generated_sample_paths: string[];
  created_at: string;
};

type ScrapeCriteria = {
  followerMin?: number;
  followerMax?: number;
  platforms?: string[];
  activityMode?: "active" | "inactive";
  inactivityWeeks?: number;
  preset?: string;
};

type SignedAsset = { path: string; signedUrl: string | null; error?: string };
type LeadAssets = { samples: SignedAsset[]; generated: SignedAsset[]; preview: SignedAsset | null };

export default function AdminLeadsClient() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assetsById, setAssetsById] = useState<Record<string, LeadAssets>>({});
  const [triggeringScrape, setTriggeringScrape] = useState(false);
  const [showCriteria, setShowCriteria] = useState(false);
  const [outreachPreview, setOutreachPreview] = useState<{ id: string; handle: string; message: string } | null>(null);
  const [sendingOutreach, setSendingOutreach] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [criteria, setCriteria] = useState<ScrapeCriteria>({
    preset: "default",
    followerMin: 50000,
    followerMax: 250000,
    platforms: ["instagram", "twitter", "reddit"],
    activityMode: "active",
  });

  async function load() {
    const res = await fetch("/api/admin/leads");
    const json = (await res.json().catch(() => ({}))) as { leads?: LeadRow[]; error?: string };
    setRows(json.leads ?? []);
    if (!res.ok) {
      setMessage(json.error ?? "Failed to load leads");
    } else if (json.error) {
      setMessage(json.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(t);
  }, [message]);

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
  const filtered = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (!normalizedQuery) return true;
    const platforms = row.platforms_found ?? [];
    const verticals = row.content_verticals ?? [];
    const haystack = [row.handle, row.platform, ...platforms, ...verticals].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const sorted = [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((r) => r.id)));
    }
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected lead(s)?`)) return;
    setDeleting(true);
    setMessage("Deleting...");
    const res = await fetch("/api/admin/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; deleted?: number };
    if (!res.ok) {
      setMessage(json.error ?? "Delete failed");
    } else {
      setMessage(`Deleted ${json.deleted ?? ids.length} lead(s).`);
      setSelectedIds(new Set());
      await load();
    }
    setDeleting(false);
  }

  async function approve(id: string, approved: boolean) {
    setMessage("Updating...");
    const res = await fetch(`/api/admin/leads/${id}/approve`, {
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

  const outreachMessage = (handle: string) =>
    `Hi ${handle}, we help creators scale with done-for-you AI content. ` +
    `We generated a personalized concept sample and can help you launch quickly. ` +
    `Even if you do not want our services, the generated sample is yours to keep and use. ` +
    `Click to learn more.`;

  function openOutreachPreview(row: LeadRow) {
    setOutreachPreview({
      id: row.id,
      handle: row.handle,
      message: outreachMessage(row.handle),
    });
  }

  async function confirmSendOutreach() {
    if (!outreachPreview) return;
    setSendingOutreach(true);
    setMessage("Sending...");
    const id = outreachPreview.id;
    setOutreachPreview(null);
    const res = await fetch(`/api/admin/leads/${id}/outreach`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Outreach failed");
    } else {
      setMessage("Outreach sent. Lead marked as messaged. (No actual DM sent yet—connect a DM provider.)");
    }
    await load();
    setSendingOutreach(false);
  }

  async function classifyImages(id: string) {
    setMessage("Classifying images...");
    const res = await fetch(`/api/admin/leads/${id}/classify-images`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { error?: string; content_verticals?: string[] };
    if (!res.ok) {
      setMessage(json.error ?? "Classification failed");
      return;
    }
    setMessage(`Classified: ${(json.content_verticals ?? []).join(", ") || "none"}`);
    await load();
  }

  async function generateSample(id: string) {
    setMessage("Generating AI sample...");
    const res = await fetch(`/api/admin/leads/${id}/generate-sample`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { error?: string; generated?: number };
    if (!res.ok) {
      setMessage(json.error ?? "Generation failed");
      return;
    }
    setMessage(`Generated ${json.generated ?? 0} AI sample(s).`);
    await load();
    if (assetsById[id]) {
      const assetsRes = await fetch(`/api/admin/leads/${id}/assets`);
      const assetsJson = (await assetsRes.json().catch(() => ({}))) as { samples?: SignedAsset[]; generated?: SignedAsset[]; preview?: SignedAsset | null };
      if (assetsRes.ok) {
        setAssetsById((prev) => ({
          ...prev,
          [id]: {
            samples: assetsJson.samples ?? prev[id]?.samples ?? [],
            generated: assetsJson.generated ?? [],
            preview: assetsJson.preview ?? null,
          },
        }));
      }
    }
  }

  async function expand(row: LeadRow) {
    const next = expandedId === row.id ? null : row.id;
    setExpandedId(next);
    if (!next || assetsById[next]) return;
    const res = await fetch(`/api/admin/leads/${next}/assets`);
    const json = (await res.json().catch(() => ({}))) as { samples?: SignedAsset[]; generated?: SignedAsset[]; preview?: SignedAsset | null; error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Failed to load photos");
      return;
    }
    setAssetsById((prev) => ({
      ...prev,
      [next]: {
        samples: json.samples ?? [],
        generated: json.generated ?? [],
        preview: json.preview ?? null,
      },
    }));
  }

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const ingestUrl = `${baseUrl}/api/admin/leads/ingest`;

  function copyIngestUrl() {
    navigator.clipboard.writeText(ingestUrl);
    setMessage("Copied to clipboard");
  }

  async function triggerScrape() {
    setTriggeringScrape(true);
    setMessage("Running scrape...");
    try {
      const body: { criteria?: Record<string, unknown> } = showCriteria
        ? {
            criteria: {
              followerRange: (criteria.platforms ?? ["instagram", "twitter"]).reduce(
                (acc, p) => {
                  acc[p] = { min: criteria.followerMin, max: criteria.followerMax };
                  return acc;
                },
                {} as Record<string, { min?: number; max?: number }>
              ),
              platforms: criteria.platforms,
              activityMode: criteria.activityMode,
              inactivityWeeks: criteria.activityMode === "inactive" ? criteria.inactivityWeeks : undefined,
            },
          }
        : {};
      const res = await fetch("/api/admin/leads/trigger-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const text = await res.text();
      const json = (() => {
        try {
          return JSON.parse(text) as { error?: string; imported?: number; message?: string };
        } catch {
          return {};
        }
      })();
      if (!res.ok) {
        setMessage(json.error ?? `Scrape failed (${res.status})`);
        return;
      }
      setMessage(json.message ?? `Imported ${json.imported ?? 0} leads.`);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`Scrape failed: ${msg}`);
    } finally {
      setTriggeringScrape(false);
    }
  }

  return (
    <div>
      {outreachPreview ? (
        <div
          role="dialog"
          aria-labelledby="outreach-preview-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => e.target === e.currentTarget && setOutreachPreview(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: 480,
              margin: 16,
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="outreach-preview-title" style={{ marginTop: 0, marginBottom: 12 }}>
              Preview outreach message
            </h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              To: <strong>{outreachPreview.handle}</strong>
            </p>
            <div
              style={{
                padding: 12,
                background: "var(--surface-soft)",
                borderRadius: 8,
                fontSize: 14,
                lineHeight: 1.5,
                marginBottom: 16,
                whiteSpace: "pre-wrap",
              }}
            >
              {outreachPreview.message}
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
              This will mark the lead as &quot;messaged&quot; and save the message in notes. No actual DM/email is sent yet—DM provider not connected.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn btn-ghost"
                onClick={() => setOutreachPreview(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void confirmSendOutreach()}
                disabled={sendingOutreach}
                type="button"
              >
                {sendingOutreach ? "Sending…" : "Send (mark as messaged)"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Lead Pipeline</h2>
        <p className="muted">Click Run scrape to fetch leads from YouTube, Reddit, and aggregators. Review, approve, generate AI samples, and send outreach.</p>

        <details className="card" style={{ marginTop: 12, padding: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Setup: API keys required for scraping</summary>
          <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6 }}>
            <p><strong>Add these in Vercel → Settings → Environment Variables:</strong></p>
            <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
              <li><code>YOUTUBE_API_KEY</code> — <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console</a> → Create API Key (enable YouTube Data API v3)</li>
              <li><code>REDDIT_CLIENT_ID</code> + <code>REDDIT_CLIENT_SECRET</code> — <a href="https://www.reddit.com/prefs/apps" target="_blank" rel="noreferrer">reddit.com/prefs/apps</a> → Create app (Script or Web type)</li>
              <li><code>SCRAPER_API_KEY</code> — (optional) scraperapi.com if you want paid proxy. Otherwise we use free AllOrigins fallback when direct fetch fails</li>
              <li><code>ANTIGRAVITY_WEBHOOK_SECRET</code> — For ingest webhook and local scrape script (choose a random string)</li>
            </ul>
            <p style={{ marginTop: 8 }}>
              <strong>If Vercel gets 403</strong> (Reddit/aggregators block cloud IPs), run scrapers locally:
            </p>
            <pre style={{ margin: "8px 0", padding: 10, background: "var(--surface-soft)", borderRadius: 8, fontSize: 12, overflow: "auto" }}>
{`BASE_URL=https://your-app.vercel.app WEBHOOK_SECRET=<ANTIGRAVITY_WEBHOOK_SECRET> npm run scrape:local`}
            </pre>
          </div>
        </details>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <button
            className="btn btn-primary"
            onClick={() => void triggerScrape()}
            disabled={triggeringScrape}
            type="button"
            title="Runs the scrape now and imports leads"
          >
            {triggeringScrape ? "Triggering…" : "Run scrape"}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setShowCriteria(!showCriteria)}
            type="button"
          >
            {showCriteria ? "Hide criteria" : "Set criteria"}
          </button>
          {(message || triggeringScrape) ? (
            <span style={{ fontSize: 14, color: triggeringScrape ? "var(--muted)" : "inherit" }}>
              {triggeringScrape ? "Running scrape..." : message}
            </span>
          ) : null}
          <span className="muted" style={{ fontSize: 13 }}>
            Runs YouTube, Reddit, OnlyFinder, FanFox, JuicySearch. Add API keys above if scraping returns 0 leads.
          </span>
        </div>

        {showCriteria ? (
          <div className="card" style={{ marginTop: 12, padding: 14 }}>
            <h4 style={{ marginTop: 0, marginBottom: 10 }}>Discovery criteria</h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="muted" style={{ fontSize: 12 }}>Follower min</span>
                <input
                  className="input"
                  type="number"
                  value={criteria.followerMin ?? ""}
                  onChange={(e) => setCriteria((c) => ({ ...c, followerMin: Number(e.target.value) || undefined }))}
                  placeholder="50000"
                  style={{ width: 100 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="muted" style={{ fontSize: 12 }}>Follower max</span>
                <input
                  className="input"
                  type="number"
                  value={criteria.followerMax ?? ""}
                  onChange={(e) => setCriteria((c) => ({ ...c, followerMax: Number(e.target.value) || undefined }))}
                  placeholder="250000"
                  style={{ width: 100 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="muted" style={{ fontSize: 12 }}>Activity</span>
                <select
                  className="input"
                  value={criteria.activityMode ?? "active"}
                  onChange={(e) => setCriteria((c) => ({ ...c, activityMode: e.target.value as "active" | "inactive" }))}
                  style={{ minWidth: 120 }}
                >
                  <option value="active">Active (24–48h)</option>
                  <option value="inactive">Inactive (no posts)</option>
                </select>
              </label>
              {criteria.activityMode === "inactive" ? (
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Inactive weeks</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={criteria.inactivityWeeks ?? 2}
                    onChange={(e) => setCriteria((c) => ({ ...c, inactivityWeeks: Number(e.target.value) || 2 }))}
                    style={{ width: 60 }}
                  />
                </label>
              ) : null}
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="muted" style={{ fontSize: 12 }}>Preset</span>
                <select
                  className="input"
                  value={criteria.preset ?? "default"}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCriteria((c) => ({
                      ...c,
                      preset: v,
                      ...(v === "established" && { followerMin: 500000, followerMax: undefined }),
                      ...(v === "mid" && { followerMin: 50000, followerMax: 250000 }),
                      ...(v === "inactive" && { activityMode: "inactive" as const, inactivityWeeks: 2 }),
                    }));
                  }}
                  style={{ minWidth: 160 }}
                >
                  <option value="default">Default</option>
                  <option value="established">Established (500k+)</option>
                  <option value="mid">Mid-tier (50k–250k)</option>
                  <option value="inactive">Inactive (2+ weeks)</option>
                </select>
              </label>
            </div>
          </div>
        ) : null}

        <details className="card" style={{ marginTop: 12, padding: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 800 }}>Ingest webhook (Antigravity)</summary>
          <p className="muted" style={{ marginTop: 10 }}>
            Configure the bot to POST to this URL with <code>Authorization: Bearer &lt;ANTIGRAVITY_WEBHOOK_SECRET&gt;</code>
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code
              style={{
                flex: 1,
                minWidth: 200,
                padding: 8,
                background: "var(--surface-soft)",
                borderRadius: 8,
                wordBreak: "break-all",
                fontSize: 13,
              }}
            >
              {ingestUrl}
            </code>
            <button className="btn btn-ghost" type="button" onClick={copyIngestUrl}>
              Copy
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Body: <code>{`{ "leads": [{ "handle": "@user", "platform": "instagram", "profileUrl": "...", "followerCount": 50000, "sampleUrls": ["https://..."] }] }`}</code>
          </p>
        </details>

        <div className="tabs" style={{ marginTop: 14 }}>
          {(
            [
              ["all", "All"],
              ["imported", "Imported"],
              ["approved", "Approved"],
              ["rejected", "Rejected"],
              ["messaged", "Messaged"],
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
            placeholder="Search by handle or platform..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <button className="btn btn-ghost" onClick={() => void load()} type="button">
            Refresh
          </button>
          {selectedIds.size > 0 ? (
            <button
              className="btn btn-ghost"
              onClick={() => void deleteSelected()}
              disabled={deleting}
              type="button"
              style={{ color: "var(--error, #e5534b)" }}
            >
              {deleting ? "Deleting…" : `Delete ${selectedIds.size} selected`}
            </button>
          ) : null}
          <span className="muted" style={{ fontSize: 12 }}>
            {sorted.length} / {rows.length}
          </span>
        </div>

        {message ? <p style={{ marginTop: 10 }}>{message}</p> : null}
        {loading ? <p>Loading...</p> : null}
        {!loading && rows.length === 0 ? <p className="muted">No leads yet. Click Run scrape to fetch leads from Reddit.</p> : null}
      </div>

      {!loading && sorted.length > 0 ? (
        <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={sorted.length > 0 && selectedIds.size === sorted.length}
                    onChange={() => toggleSelectAll()}
                    aria-label="Select all"
                  />
                </th>
                <th>Handle</th>
                <th>Platform</th>
                <th>Followers</th>
                <th>Engagement</th>
                <th>Score</th>
                <th>Status</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const isExpanded = expandedId === row.id;
                const assets = assetsById[row.id];
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          aria-label={`Select ${row.handle}`}
                        />
                      </td>
                      <td>
                        <strong>{row.handle}</strong>
                        {row.profile_url ? (
                          <a href={row.profile_url} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 12, color: "var(--accent)" }}>
                            profile
                          </a>
                        ) : null}
                        {(row.platforms_found?.length ?? 0) > 0 ? (
                          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                            Found on: {row.platforms_found!.join(", ")}
                          </div>
                        ) : null}
                        {(row.content_verticals?.length ?? 0) > 0 ? (
                          <div style={{ marginTop: 4 }}>
                            {row.content_verticals!.map((v) => (
                              <span key={v} className="badge badge-muted" style={{ marginRight: 4, fontSize: 10 }}>
                                {v}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td>{row.platform}</td>
                      <td>{row.follower_count}</td>
                      <td>{row.engagement_rate}%</td>
                      <td>
                        <strong>{row.score}</strong>
                      </td>
                      <td>
                        <span className="badge">{row.status}</span>
                      </td>
                      <td className="muted" style={{ fontSize: 13 }}>
                        {new Date(row.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="btn btn-ghost" onClick={() => void expand(row)} type="button">
                          {isExpanded ? "Hide" : "Review"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr>
                        <td colSpan={9}>
                          <div className="card" style={{ margin: "10px 0", padding: 14 }}>
                            <div className="split" style={{ gap: 20, alignItems: "start" }}>
                              <div>
                                <h3 style={{ marginTop: 0, marginBottom: 8 }}>Scraped photos (3–5)</h3>
                                {!assets ? (
                                  <p className="muted">Loading...</p>
                                ) : assets.samples.length === 0 ? (
                                  <p className="muted">No scraped photos. Antigravity should include sampleUrls.</p>
                                ) : (
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {assets.samples.map((a) => (
                                      <div key={a.path} className="card" style={{ padding: 6, width: 100, height: 100 }}>
                                        {a.signedUrl ? (
                                          <img
                                            src={a.signedUrl}
                                            alt="Sample"
                                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }}
                                          />
                                        ) : (
                                          <div className="muted" style={{ fontSize: 11 }}>No preview</div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {assets?.generated && assets.generated.length > 0 ? (
                                  <div style={{ marginTop: 14 }}>
                                    <h3 style={{ marginTop: 0, marginBottom: 8 }}>AI samples</h3>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      {assets.generated.map((a) => (
                                        <div key={a.path} className="card" style={{ padding: 6, width: 100, height: 100 }}>
                                          {a.signedUrl ? (
                                            <img
                                              src={a.signedUrl}
                                              alt="Generated"
                                              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }}
                                            />
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              <div>
                                {(row.platforms_found?.length ?? 0) > 0 ? (
                                  <div className="callout" style={{ marginBottom: 12 }}>
                                    <div className="callout-title">Found on platforms</div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      {(row.profile_urls && Object.keys(row.profile_urls).length > 0
                                        ? row.platforms_found!.map((p) => ({
                                            platform: p,
                                            url: row.profile_urls![p],
                                          }))
                                        : row.platforms_found!.map((p) => ({ platform: p, url: null }))
                                      ).map(({ platform, url }) =>
                                        url ? (
                                          <a key={platform} href={url} target="_blank" rel="noreferrer" className="badge" style={{ textDecoration: "none" }}>
                                            {platform}
                                          </a>
                                        ) : (
                                          <span key={platform} className="badge badge-muted">
                                            {platform}
                                          </span>
                                        )
                                      )}
                                    </div>
                                  </div>
                                ) : null}
                                {row.notes ? (
                                  <div className="callout" style={{ marginBottom: 12 }}>
                                    <div className="callout-title">Notes</div>
                                    <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{row.notes}</pre>
                                  </div>
                                ) : null}
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => void approve(row.id, true)}
                                    disabled={row.status !== "imported"}
                                    type="button"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    className="btn btn-ghost"
                                    onClick={() => void approve(row.id, false)}
                                    disabled={row.status !== "imported"}
                                    type="button"
                                  >
                                    Reject
                                  </button>
                                  <button
                                    className="btn btn-ghost"
                                    onClick={() => void classifyImages(row.id)}
                                    disabled={(row.sample_paths?.length ?? 0) === 0}
                                    type="button"
                                    title="Use AI to detect content vertical (swimwear, lingerie, etc.)"
                                  >
                                    Classify images
                                  </button>
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => void generateSample(row.id)}
                                    disabled={(row.sample_paths?.length ?? 0) === 0}
                                    type="button"
                                  >
                                    Generate AI sample
                                  </button>
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => openOutreachPreview(row)}
                                    disabled={row.status !== "approved"}
                                    type="button"
                                  >
                                    Send outreach
                                  </button>
                                </div>
                              </div>
                            </div>
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
