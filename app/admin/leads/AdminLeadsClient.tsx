"use client";

/* eslint-disable @next/next/no-img-element */

import { Fragment, useEffect, useState } from "react";
import type { LeadStatus } from "@/lib/db-enums";

type LeadRow = {
  id: string;
  email?: string | null;
  source: string;
  handle: string;
  platform: string;
  follower_count: number;
  engagement_rate: number;
  luxury_tag_hits: number;
  score: number;
  status: LeadStatus;
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

type Props = {
  initialSessionEmail: string | null;
  initialIsAdmin: boolean;
};

export default function AdminLeadsClient({ initialSessionEmail, initialIsAdmin }: Props) {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
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
  const [enqueueingSamples, setEnqueueingSamples] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadRow | null>(null);
  const [leadFormMode, setLeadFormMode] = useState<"create" | "edit" | null>(null);
  const [showArchiveLeadModal, setShowArchiveLeadModal] = useState<LeadRow | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(initialSessionEmail);
  const [sessionIsAdmin, setSessionIsAdmin] = useState<boolean>(initialIsAdmin);
  const [leadForm, setLeadForm] = useState({
    email: "",
    handle: "",
    platform: "instagram",
    source: "manual",
    status: "new" as LeadStatus,
    profile_url: "",
    notes: "",
    follower_count: "0",
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
    let cancelled = false;
    async function loadSession() {
      const res = await fetch("/api/admin/session", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { email?: string | null; isAdmin?: boolean };
      if (cancelled) return;
      setSessionEmail(json.email ?? null);
      setSessionIsAdmin(Boolean(json.isAdmin));
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
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

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const summary = {
    newToday: rows.filter((r) => new Date(r.created_at) >= todayStart).length,
    qualified: rows.filter((r) =>
      ["qualified", "sample_queued", "sample_generated", "outreach_queued", "contacted", "replied", "converted"].includes(r.status)
    ).length,
    sent: rows.filter((r) =>
      ["outreach_queued", "contacted", "replied", "converted"].includes(r.status)
    ).length,
    converted: rows.filter((r) => r.status === "converted").length,
  };

  function sampleStatus(row: LeadRow): "Not Generated" | "Generated" | "Sent" {
    if (["outreach_queued", "contacted", "replied", "converted"].includes(row.status)) return "Sent";
    if (row.status === "sample_generated" || (row.generated_sample_paths?.length ?? 0) > 0) return "Generated";
    return "Not Generated";
  }

  function outreachStatus(row: LeadRow): "Not Sent" | "Sent" | "Replied" | "Converted" {
    if (row.status === "converted") return "Converted";
    if (row.status === "replied") return "Replied";
    if (["outreach_queued", "contacted"].includes(row.status)) return "Sent";
    return "Not Sent";
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (!normalizedQuery) return true;
    const platforms = row.platforms_found ?? [];
    const verticals = row.content_verticals ?? [];
    const haystack = [row.handle, row.platform, ...platforms, ...verticals].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const sorted = [...filtered].sort((a, b) => {
    const pa = (a.platform ?? "").toLowerCase();
    const pb = (b.platform ?? "").toLowerCase();
    if (pa !== pb) return pa.localeCompare(pb);
    return (b.score ?? 0) - (a.score ?? 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const debugRows = rows.slice(0, 5);
  const hardBtnStyle = {
    border: "2px solid #111",
    background: "#fff",
    color: "#111",
    padding: "8px 10px",
    borderRadius: 6,
    fontWeight: 700,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-block",
  };

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

  async function archiveSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Archive ${ids.length} selected lead(s)?`)) return;
    setDeleting(true);
    setMessage("Archiving...");
    const res = await fetch("/api/admin/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, archiveReason: "bulk_admin_archive" }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; archived?: number };
    if (!res.ok) {
      setMessage(json.error ?? "Archive failed");
    } else {
      setMessage(`Archived ${json.archived ?? ids.length} lead(s).`);
      setSelectedIds(new Set());
      await load();
    }
    setDeleting(false);
  }

  function openCreateLeadModal() {
    setLeadFormMode("create");
    setEditingLead(null);
    setLeadForm({
      email: "",
      handle: "",
      platform: "instagram",
      source: "manual",
      status: "new",
      profile_url: "",
      notes: "",
      follower_count: "0",
    });
  }

  function openEditLeadModal(row: LeadRow) {
    setLeadFormMode("edit");
    setEditingLead(row);
    setLeadForm({
      email: row.email ?? "",
      handle: row.handle ?? "",
      platform: row.platform ?? "instagram",
      source: row.source ?? "manual",
      status: row.status ?? "new",
      profile_url: row.profile_url ?? "",
      notes: row.notes ?? "",
      follower_count: String(row.follower_count ?? 0),
    });
  }

  async function saveLeadForm() {
    if (!leadForm.handle.trim()) {
      setMessage("Handle/name is required.");
      return;
    }
    setMessage("Creating lead...");
    if (leadFormMode === "create") {
      const res = await fetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: [
            {
              source: leadForm.source.trim() || "manual",
              email: leadForm.email.trim() || undefined,
              handle: leadForm.handle.trim(),
              platform: leadForm.platform.trim() || "instagram",
              profileUrl: leadForm.profile_url.trim() || undefined,
              notes: leadForm.notes.trim() || undefined,
            },
          ],
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(json.error ?? "Create lead failed");
        return;
      }
      setMessage("Lead created.");
      setLeadFormMode(null);
      await load();
      return;
    }

    if (!editingLead) return;
    setMessage("Saving lead...");
    const res = await fetch(`/api/admin/leads/${editingLead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: leadForm.handle.trim(),
        email: leadForm.email.trim() || null,
        source: leadForm.source.trim(),
        platform: leadForm.platform.trim(),
        status: leadForm.status,
        profile_url: leadForm.profile_url.trim() || null,
        notes: leadForm.notes.trim() || null,
        follower_count: Number(leadForm.follower_count) || 0,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Update failed");
      return;
    }
    setMessage("Lead updated.");
    setLeadFormMode(null);
    setEditingLead(null);
    await load();
  }

  async function archiveLeadManual(row: LeadRow) {
    setMessage("Archiving lead...");
    const res = await fetch(`/api/admin/leads/${row.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archiveReason: "admin_archive" }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Archive failed");
      return;
    }
    setMessage("Lead archived.");
    await load();
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
    setMessage(approved ? "Qualified." : "Rejected.");
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: (approved ? "qualified" : "rejected") as LeadStatus } : r))
    );
    void load();
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
      setMessage("Outreach sent. Lead marked as contacted. (No actual DM sent yet—connect a DM provider.)");
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
    void load();
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
          return JSON.parse(text) as { error?: string; imported?: number; updated?: number; enqueued?: number; message?: string };
        } catch {
          return {};
        }
      })();
      if (!res.ok) {
        setMessage(json.error ?? `Scrape failed (${res.status})`);
        return;
      }
      setMessage(json.message ?? `Imported ${json.imported ?? 0} leads.${(json.updated ?? 0) > 0 ? ` Updated ${json.updated} existing.` : ""}${(json.enqueued ?? 0) > 0 ? ` Queued ${json.enqueued} for AI samples.` : ""}`);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`Scrape failed: ${msg}`);
    } finally {
      setTriggeringScrape(false);
    }
  }

  async function enqueueSamples() {
    setEnqueueingSamples(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/automation/run-enqueue-samples", { method: "POST", credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; enqueued?: number; error?: string; reason?: string };
      if (!res.ok) {
        setMessage(json.error ?? `Enqueue failed (${res.status})`);
        return;
      }
      const n = json.enqueued ?? 0;
      if (n > 0) {
        setMessage(`Queued ${n} lead(s) for AI sample generation. Worker will process when running.`);
        await load();
      } else {
        setMessage(json.reason === "daily_budget_reached" ? "Daily budget reached; no new jobs queued." : "No qualified leads to enqueue (need 3+ images per lead) or already queued.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`Enqueue failed: ${msg}`);
    } finally {
      setEnqueueingSamples(false);
    }
  }

  return (
    <div>
      <div
        style={{
          background: "#ffef5a",
          color: "#1b1b1b",
          border: "2px solid #d4b400",
          borderRadius: 10,
          padding: "10px 12px",
          fontWeight: 800,
          letterSpacing: "0.02em",
          marginBottom: 12,
        }}
      >
        ADMIN LEAD CONTROLS ACTIVE
      </div>
      <div className="card" style={{ marginBottom: 12, border: "2px solid #08a0ff" }}>
        <strong>ADMIN SESSION DEBUG</strong>
        <p style={{ margin: "8px 0 0" }}>
          Current session email: <strong>{sessionEmail ?? "none"}</strong> · isAdmin: <strong>{String(sessionIsAdmin)}</strong>
        </p>
      </div>
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
              This will mark the lead as &quot;contacted&quot; and save the message in notes. No actual DM/email is sent yet—DM provider not connected.
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
                {sendingOutreach ? "Sending…" : "Send (mark as contacted)"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {leadFormMode ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lead-form-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setLeadFormMode(null);
              setEditingLead(null);
            }
          }}
        >
          <div className="card" style={{ maxWidth: 640, width: "100%", margin: 16, padding: 16 }}>
            <h3 id="lead-form-title" style={{ marginTop: 0 }}>
              {leadFormMode === "create" ? "Add lead" : "Edit lead"}
            </h3>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="muted">Email</span>
                <input className="input" value={leadForm.email} onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="muted">Handle / name</span>
                <input className="input" value={leadForm.handle} onChange={(e) => setLeadForm((f) => ({ ...f, handle: e.target.value }))} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="muted">Platform</span>
                <input className="input" value={leadForm.platform} onChange={(e) => setLeadForm((f) => ({ ...f, platform: e.target.value }))} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="muted">Source</span>
                <input className="input" value={leadForm.source} onChange={(e) => setLeadForm((f) => ({ ...f, source: e.target.value }))} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="muted">Status</span>
                <select className="input" value={leadForm.status} onChange={(e) => setLeadForm((f) => ({ ...f, status: e.target.value as LeadStatus }))}>
                  {["new", "qualified", "sample_queued", "sample_generated", "outreach_queued", "contacted", "replied", "converted", "rejected"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="muted">Profile URL</span>
                <input className="input" value={leadForm.profile_url} onChange={(e) => setLeadForm((f) => ({ ...f, profile_url: e.target.value }))} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="muted">Follower count</span>
                <input className="input" type="number" value={leadForm.follower_count} onChange={(e) => setLeadForm((f) => ({ ...f, follower_count: e.target.value }))} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="muted">Notes</span>
                <textarea className="input" rows={3} value={leadForm.notes} onChange={(e) => setLeadForm((f) => ({ ...f, notes: e.target.value }))} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn btn-ghost" type="button" onClick={() => setLeadFormMode(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={() => void saveLeadForm()}>
                {leadFormMode === "create" ? "Create lead" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showArchiveLeadModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-lead-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => e.target === e.currentTarget && setShowArchiveLeadModal(null)}
        >
          <div className="card" style={{ maxWidth: 520, width: "100%", margin: 16, padding: 16 }}>
            <h3 id="archive-lead-title" style={{ marginTop: 0 }}>
              Archive lead
            </h3>
            <p style={{ marginTop: 0 }}>
              Archive <strong>{showArchiveLeadModal.handle}</strong>? This removes the lead from active admin lists but keeps audit history.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn btn-ghost" type="button" onClick={() => setShowArchiveLeadModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  void archiveLeadManual(showArchiveLeadModal);
                  setShowArchiveLeadModal(null);
                }}
              >
                Archive lead
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Lead Pipeline</h2>
        <p className="muted">Click Run scrape to fetch leads from YouTube, Reddit, and aggregators. Review, approve, generate AI samples, and send outreach.</p>

        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          Scraping runs immediately when you click below and does not require the worker. It may take 30–60 seconds. Daily scrape also runs automatically at 8:00 UTC (Vercel cron).
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <button
            className="btn btn-primary"
            onClick={openCreateLeadModal}
            type="button"
            title="Create lead manually"
          >
            Add lead
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void triggerScrape()}
            disabled={triggeringScrape}
            type="button"
            title="Runs the scrape now and imports/updates leads, then queues qualified leads for AI sample generation"
          >
            {triggeringScrape ? "Triggering…" : "Run scrape"}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void enqueueSamples()}
            disabled={enqueueingSamples}
            type="button"
            title="Queue qualified leads (3+ images) for AI sample generation. Requires worker configured."
          >
            {enqueueingSamples ? "Enqueueing…" : "Enqueue samples"}
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
            Runs YouTube, Reddit, OnlyFinder, FanFox, JuicySearch.
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

        <div style={{ display: "flex", gap: 24, marginTop: 14, marginBottom: 8, flexWrap: "wrap" }}>
          <span>New Today: <strong>{summary.newToday}</strong></span>
          <span>Qualified: <strong>{summary.qualified}</strong></span>
          <span>Sent: <strong>{summary.sent}</strong></span>
          <span>Converted: <strong>{summary.converted}</strong></span>
        </div>

        <div className="tabs" style={{ marginTop: 8 }}>
          {(
            [
              ["all", "All"],
              ["new", "New"],
              ["qualified", "Qualified"],
              ["sample_generated", "Sample generated"],
              ["outreach_queued", "Outreach queued"],
              ["contacted", "Contacted"],
              ["rejected", "Rejected"],
              ["replied", "Replied"],
              ["converted", "Converted"],
            ] as [LeadStatus | "all", string][]
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
              onClick={() => void archiveSelected()}
              disabled={deleting}
              type="button"
              style={{ color: "var(--error, #e5534b)" }}
            >
              {deleting ? "Archiving…" : `Archive ${selectedIds.size} selected`}
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
      <div className="card" style={{ marginTop: 12, border: "2px solid #d4b400" }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>ADMIN LEAD CONTROLS DEBUG</h3>
        <p style={{ marginTop: 0 }}>
          Total leads loaded: <strong>{rows.length}</strong>
        </p>
        {debugRows.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>No lead rows loaded yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {debugRows.map((row) => (
              <div key={`debug-lead-${row.id}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                <strong>{row.handle}</strong>
                <code>{row.id}</code>
                <span className="muted">{row.email ?? row.platform}</span>
                <button style={hardBtnStyle} type="button" onClick={() => openEditLeadModal(row)}>Edit</button>
                <button type="button" style={{ ...hardBtnStyle, color: "#a40000", borderColor: "#a40000" }} onClick={() => setShowArchiveLeadModal(row)}>
                  Archive
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card" style={{ marginTop: 12, border: "2px dashed #d4b400" }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Temporary lead action test bar</h3>
        {rows.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>{loading ? "Loading leads..." : "No lead rows available."}</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((row) => (
              <div key={`test-lead-${row.id}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                <strong>{row.handle}</strong>
                <span className="muted">{row.email ?? row.platform}</span>
                <button style={hardBtnStyle} type="button" onClick={() => openEditLeadModal(row)}>Edit</button>
                <button type="button" style={{ ...hardBtnStyle, color: "#a40000", borderColor: "#a40000" }} onClick={() => setShowArchiveLeadModal(row)}>
                  Archive
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {!loading && sorted.length > 0 ? (
        <div>
          <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", minWidth: 820 }}>
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
                  <th>Platform</th>
                  <th>Handle</th>
                  <th>Actions</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Sample Status</th>
                  <th>Outreach Status</th>
                  <th>Last Activity</th>
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
                        <td>{row.platform}</td>
                        <td>
                          {row.email ? <div className="muted" style={{ fontSize: 12 }}>{row.email}</div> : null}
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
                        <td style={{ whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="btn btn-primary" onClick={() => openEditLeadModal(row)} type="button">
                              Edit
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ color: "var(--error, #e5534b)" }}
                              onClick={() => setShowArchiveLeadModal(row)}
                              type="button"
                            >
                              Archive
                            </button>
                            <button className="btn btn-ghost" onClick={() => void expand(row)} type="button">
                              {isExpanded ? "Hide" : (row.sample_paths?.length ? `Review (${row.sample_paths.length})` : "Review")}
                            </button>
                          </div>
                        </td>
                        <td><strong>{row.score}</strong></td>
                        <td><span className="badge">{row.status}</span></td>
                        <td>{sampleStatus(row)}</td>
                        <td>{outreachStatus(row)}</td>
                        <td className="muted" style={{ fontSize: 13 }}>
                          {new Date(row.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr>
                          <td colSpan={10}>
                            <div className="card" style={{ margin: "10px 0", padding: 14 }}>
                            <div className="split" style={{ gap: 20, alignItems: "start" }}>
                              <div>
                                <h3 style={{ marginTop: 0, marginBottom: 4 }}>Reference photos (downloaded)</h3>
                                <p className="muted" style={{ marginTop: 0, marginBottom: 8, fontSize: 13 }}>
                                  Sample images we downloaded from this lead’s profile; used for AI sample generation.
                                </p>
                                {!assets ? (
                                  <p className="muted">Loading...</p>
                                ) : assets.samples.length === 0 ? (
                                  <p className="muted">No reference photos yet. Scrape may not have found images for this lead.</p>
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
                                    disabled={row.status !== "new"}
                                    type="button"
                                  >
                                    Qualify
                                  </button>
                                  <button
                                    className="btn btn-ghost"
                                    onClick={() => void approve(row.id, false)}
                                    disabled={row.status !== "new" && row.status !== "qualified"}
                                    type="button"
                                  >
                                    Reject
                                  </button>
                                  <button
                                    className="btn btn-ghost"
                                    onClick={() => void classifyImages(row.id)}
                                    disabled={!assets || assets.samples.length === 0}
                                    type="button"
                                    title="Use AI to detect content vertical (swimwear, lingerie, etc.)"
                                  >
                                    Classify images
                                  </button>
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => void generateSample(row.id)}
                                    disabled={!assets || assets.samples.length === 0}
                                    type="button"
                                    title="Generate sample now (manual override)"
                                  >
                                    Generate Sample Now
                                  </button>
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => openOutreachPreview(row)}
                                    disabled={row.status !== "qualified" && !["outreach_queued", "contacted", "replied"].includes(row.status)}
                                    type="button"
                                  >
                                    {["outreach_queued", "contacted", "replied"].includes(row.status) ? "Resend outreach" : "Queue outreach"}
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
          <div className="card" style={{ marginTop: 12 }}>
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>Visible lead actions</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {sorted.map((row) => (
                <div key={`lead-actions-${row.id}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                  <strong style={{ minWidth: 240 }}>{row.handle}</strong>
                  <span className="muted">{row.email ?? row.platform}</span>
                  <button className="btn btn-primary" type="button" onClick={() => openEditLeadModal(row)}>Edit</button>
                  <button className="btn btn-ghost" type="button" style={{ color: "var(--error, #e5534b)" }} onClick={() => setShowArchiveLeadModal(row)}>
                    Archive
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
