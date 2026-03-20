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
};

type Summary = {
  activeCustomers: number;
  newThisWeek: number;
  canceledThisWeek: number;
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
        <button className="btn btn-primary" type="button" onClick={() => setShowAddPanel((v) => !v)}>
          {showAddPanel ? "Close" : "+ Add customer"}
        </button>
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
