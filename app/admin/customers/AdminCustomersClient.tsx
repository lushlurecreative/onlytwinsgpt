"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PACKAGE_PLANS, type PlanKey } from "@/lib/package-plans";

type CustomerRow = {
  id: string;
  workspaceId: string;
  email: string | null;
  creator: string;
  plan: string;
  stripePriceId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  rawStatus: string;
  renewalDate: string | null;
  createdAt: string;
  canceledAt: string | null;
  usage: number;
  modelStatus: string;
  lastActivity: string;
  adminNotes: string | null;
  acquisitionSource: string | null;
};

type Summary = {
  activeCustomers: number;
  newThisWeek: number;
  canceledThisWeek: number;
};

type AdminReferralLink = {
  id: string;
  code: string;
  label: string;
  created_at: string;
};

const PLAN_KEYS: PlanKey[] = [
  "starter",
  "professional",
  "elite",
  "single_batch",
  "partner_70_30",
  "partner_50_50",
];

const STATUS_OPTIONS = ["all", "active", "trialing", "past_due", "canceled", "incomplete", "needs_review", "expired"];

export default function AdminCustomersClient() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ activeCustomers: 0, newThisWeek: 0, canceledThisWeek: 0 });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showRefPanel, setShowRefPanel] = useState(false);
  const [refLinks, setRefLinks] = useState<AdminReferralLink[]>([]);
  const [refLinksLoading, setRefLinksLoading] = useState(false);
  const [newRefLabel, setNewRefLabel] = useState("");
  const [creatingRef, setCreatingRef] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [createdLink, setCreatedLink] = useState<{ url: string } | null>(null);
  const [payLinkForm, setPayLinkForm] = useState({ email: "", plan: "" as PlanKey | "", fullName: "", adminNotes: "" });

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    const res = await fetch(`/api/admin/customers?${params.toString()}`);
    const json = (await res.json().catch(() => ({}))) as { customers?: CustomerRow[]; summary?: Summary; error?: string };
    if (!res.ok) { setMessage(json.error ?? "Failed to load"); setLoading(false); return; }
    setRows(json.customers ?? []);
    setSummary(json.summary ?? { activeCustomers: 0, newThisWeek: 0, canceledThisWeek: 0 });
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const lq = q.trim().toLowerCase();
    return rows.filter((r) =>
      [r.email ?? "", r.creator, r.plan, r.status].join(" ").toLowerCase().includes(lq)
    );
  }, [rows, q]);

  async function createPaymentLink() {
    if (!payLinkForm.email.trim() || !payLinkForm.plan) return;
    setCreatingLink(true);
    setMessage("");
    const res = await fetch("/api/admin/payment-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: payLinkForm.email.trim().toLowerCase(),
        plan: payLinkForm.plan,
        fullName: payLinkForm.fullName.trim() || null,
        adminNotes: payLinkForm.adminNotes.trim() || null,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    setCreatingLink(false);
    if (!res.ok) { setMessage(json.error ?? "Failed"); return; }
    setCreatedLink({ url: json.url ?? "" });
    setPayLinkForm({ email: "", plan: "" as PlanKey | "", fullName: "", adminNotes: "" });
  }

  async function copyLink(url: string) {
    try { await navigator.clipboard.writeText(url); setMessage("Link copied."); } catch { setMessage("Copy failed — select and copy manually."); }
  }

  async function loadRefLinks() {
    setRefLinksLoading(true);
    const res = await fetch("/api/admin/referral-links");
    const json = (await res.json().catch(() => ({}))) as { links?: AdminReferralLink[] };
    setRefLinks(json.links ?? []);
    setRefLinksLoading(false);
  }

  async function createRefLink() {
    if (!newRefLabel.trim()) return;
    setCreatingRef(true);
    const res = await fetch("/api/admin/referral-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newRefLabel.trim() }),
    });
    const json = (await res.json().catch(() => ({}))) as { link?: AdminReferralLink; error?: string };
    setCreatingRef(false);
    if (!res.ok) { setMessage(json.error ?? "Failed"); return; }
    setNewRefLabel("");
    await loadRefLinks();
  }

  async function deleteRefLink(id: string) {
    await fetch("/api/admin/referral-links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setRefLinks((prev) => prev.filter((l) => l.id !== id));
  }

  function refLinkUrl(code: string) {
    const base = typeof window !== "undefined" ? window.location.origin : "https://onlytwins.dev";
    return `${base}/?ref=${code}`;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Customers</h1>
          <div style={{ display: "flex", gap: 20, marginTop: 6 }}>
            <span className="muted"><strong style={{ color: "var(--foreground)" }}>{summary.activeCustomers}</strong> active</span>
            <span className="muted"><strong style={{ color: "var(--foreground)" }}>{summary.newThisWeek}</strong> new this week</span>
            <span className="muted"><strong style={{ color: "var(--foreground)" }}>{summary.canceledThisWeek}</strong> canceled this week</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" type="button" onClick={() => setShowAddPanel((v) => !v)}>
            {showAddPanel ? "Close" : "+ Add customer"}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              setShowRefPanel((v) => !v);
              if (!showRefPanel) void loadRefLinks();
            }}
          >
            Referral links
          </button>
        </div>
      </div>

      {/* Add customer panel */}
      {showAddPanel && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Send payment link</h3>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 10 }}>
            <input className="input" placeholder="Customer email *" value={payLinkForm.email} onChange={(e) => setPayLinkForm((f) => ({ ...f, email: e.target.value }))} />
            <select className="input" value={payLinkForm.plan} onChange={(e) => setPayLinkForm((f) => ({ ...f, plan: e.target.value as PlanKey }))}>
              <option value="">Select plan *</option>
              {PLAN_KEYS.map((key) => (
                <option key={key} value={key}>{PACKAGE_PLANS[key].name} — {PACKAGE_PLANS[key].displayPrice}</option>
              ))}
            </select>
            <input className="input" placeholder="Full name (optional)" value={payLinkForm.fullName} onChange={(e) => setPayLinkForm((f) => ({ ...f, fullName: e.target.value }))} />
            <input className="input" placeholder="Internal notes (optional)" value={payLinkForm.adminNotes} onChange={(e) => setPayLinkForm((f) => ({ ...f, adminNotes: e.target.value }))} />
          </div>
          <button
            className="btn btn-primary"
            type="button"
            disabled={creatingLink || !payLinkForm.email.trim() || !payLinkForm.plan}
            onClick={() => void createPaymentLink()}
          >
            {creatingLink ? "Creating…" : "Generate payment link"}
          </button>
          {createdLink?.url && (
            <div style={{ marginTop: 12, padding: 12, background: "rgba(124,58,237,0.08)", borderRadius: 8 }}>
              <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Payment link ready</p>
              <input className="input" readOnly value={createdLink.url} style={{ width: "100%", marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" type="button" onClick={() => void copyLink(createdLink.url)}>Copy link</button>
                <a href={createdLink.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Open link</a>
                <button className="btn btn-ghost" type="button" onClick={() => setCreatedLink(null)}>Dismiss</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Referral links panel */}
      {showRefPanel && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>Referral &amp; affiliate links</h3>
          <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: 13 }}>
            Generate tracking links for campaigns, partners, or influencers. Each link sets a ?ref= code that is recorded on signup.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input
              className="input"
              placeholder="Label (e.g. Instagram campaign, Partner Jane)"
              value={newRefLabel}
              onChange={(e) => setNewRefLabel(e.target.value)}
              style={{ flex: 1, minWidth: 220 }}
            />
            <button
              className="btn btn-primary"
              type="button"
              disabled={creatingRef || !newRefLabel.trim()}
              onClick={() => void createRefLink()}
            >
              {creatingRef ? "Creating…" : "Generate link"}
            </button>
          </div>
          {refLinksLoading && <p className="muted" style={{ fontSize: 13 }}>Loading…</p>}
          {!refLinksLoading && refLinks.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>No referral links yet.</p>
          )}
          {refLinks.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {refLinks.map((link) => (
                <div
                  key={link.id}
                  style={{
                    display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
                    padding: "10px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 10,
                    border: "1px solid var(--line)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{link.label}</div>
                    <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {refLinkUrl(link.code)}
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: "6px 12px" }} type="button" onClick={() => void copyLink(refLinkUrl(link.code))}>
                    Copy
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }} type="button" onClick={() => void deleteRefLink(link.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="Search by name, email, plan…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 160 }}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
        </select>
        <button className="btn btn-ghost" type="button" onClick={() => void load()}>Refresh</button>
      </div>

      {message && <p style={{ marginBottom: 10 }}>{message}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && filtered.length === 0 && <p className="muted">No customers found.</p>}

      {/* Customer list */}
      {!loading && filtered.length > 0 && (
        <div className="card" style={{ overflowX: "auto", padding: 0 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--line, #333)" }}>
                <th style={{ textAlign: "left", padding: "10px 14px" }}>Customer</th>
                <th style={{ textAlign: "left", padding: "10px 14px" }}>Source</th>
                <th style={{ textAlign: "left", padding: "10px 14px" }}>Plan</th>
                <th style={{ textAlign: "left", padding: "10px 14px" }}>Status</th>
                <th style={{ textAlign: "left", padding: "10px 14px" }}>Model</th>
                <th style={{ textAlign: "left", padding: "10px 14px" }}>Renewal</th>
                <th style={{ padding: "10px 14px" }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--line, #222)" }}>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ fontWeight: 500 }}>{row.creator}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{row.email ?? "—"}</div>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--muted)" }}>
                    {row.acquisitionSource === "direct" ? "Direct" :
                     row.acquisitionSource === "referral" ? "Referral" :
                     row.acquisitionSource === "scraper" ? "Lead" :
                     row.acquisitionSource ?? "—"}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 13 }}>{row.plan}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span className="badge">{row.status}</span>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 13 }}>{row.modelStatus}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13 }}>
                    {row.renewalDate ? new Date(row.renewalDate).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <Link className="btn btn-primary" href={`/admin/customers/${row.workspaceId}`}>
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
