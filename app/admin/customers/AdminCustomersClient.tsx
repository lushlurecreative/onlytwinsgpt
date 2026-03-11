"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CustomerRow = {
  id: string;
  workspaceId: string;
  email: string | null;
  creator: string;
  creatorId: string;
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

type RecentAccount = { id: string; email: string | null; created_at: string; isCustomer: boolean };

type Props = {
  initialSessionEmail: string | null;
  initialIsAdmin: boolean;
};

export default function AdminCustomersClient({ initialSessionEmail, initialIsAdmin }: Props) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ activeCustomers: 0, newThisWeek: 0, canceledThisWeek: 0 });
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CustomerRow | null>(null);
  const [archiveConfirmText, setArchiveConfirmText] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(initialSessionEmail);
  const [sessionIsAdmin, setSessionIsAdmin] = useState<boolean>(initialIsAdmin);
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    plan: "",
    status: "active",
    stripeCustomerId: "",
    stripeSubscriptionId: "",
    renewalDate: "",
    adminNotes: "",
  });

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    const res = await fetch(`/api/admin/customers?${params.toString()}`);
    const json = (await res.json().catch(() => ({}))) as {
      customers?: CustomerRow[];
      summary?: Summary;
      recentAccounts?: RecentAccount[];
      error?: string;
    };
    if (!res.ok) {
      setMessage(json.error ?? "Failed to load customers");
      setRows([]);
      setLoading(false);
      return;
    }
    setRows(json.customers ?? []);
    setSummary(json.summary ?? { activeCustomers: 0, newThisWeek: 0, canceledThisWeek: 0 });
    setRecentAccounts(json.recentAccounts ?? []);
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

  const statusOptions = useMemo(
    () => ["all", "active", "trialing", "past_due", "canceled", "incomplete", "needs_review", "expired"],
    []
  );
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

  function startCreate() {
    setSelected(null);
    setForm({
      email: "",
      fullName: "",
      plan: "",
      status: "active",
      stripeCustomerId: "",
      stripeSubscriptionId: "",
      renewalDate: "",
      adminNotes: "",
    });
  }

  function startEdit(row: CustomerRow) {
    setSelected(row);
    setForm({
      email: row.email ?? "",
      fullName: "",
      plan: row.stripePriceId ?? "",
      status: row.rawStatus,
      stripeCustomerId: row.stripeCustomerId ?? "",
      stripeSubscriptionId: row.stripeSubscriptionId ?? "",
      renewalDate: row.renewalDate ? row.renewalDate.slice(0, 10) : "",
      adminNotes: row.adminNotes ?? "",
    });
  }

  async function createCustomer() {
    setMessage("Creating customer...");
    const res = await fetch("/api/admin/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email,
        plan: form.plan || null,
        status: form.status,
        stripeCustomerId: form.stripeCustomerId || null,
        stripeSubscriptionId: form.stripeSubscriptionId || null,
        renewalDate: form.renewalDate ? new Date(form.renewalDate).toISOString() : null,
        adminNotes: form.adminNotes || null,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Failed to create customer");
      return;
    }
    setMessage("Customer created.");
    await load();
  }

  async function saveCustomer() {
    if (!selected) return;
    setMessage("Saving changes...");
    const res = await fetch("/api/admin/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriptionId: selected.id,
        subscriberId: selected.workspaceId,
        fullName: form.fullName || null,
        plan: form.plan || null,
        status: form.status,
        stripeCustomerId: form.stripeCustomerId || null,
        stripeSubscriptionId: form.stripeSubscriptionId || null,
        renewalDate: form.renewalDate ? new Date(form.renewalDate).toISOString() : null,
        adminNotes: form.adminNotes || null,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Failed to update customer");
      return;
    }
    setMessage("Customer updated.");
    await load();
  }

  async function archiveCustomer(row: CustomerRow) {
    setMessage("Archiving customer...");
    const res = await fetch("/api/admin/customers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriptionId: row.id,
        subscriberId: row.workspaceId,
        confirmText: "ARCHIVE",
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "Failed to archive customer");
      return;
    }
    setMessage("Customer archived.");
    await load();
  }

  return (
    <section>
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
        ADMIN CUSTOMER CONTROLS ACTIVE
      </div>
      <div className="card" style={{ marginBottom: 12, border: "2px solid #08a0ff" }}>
        <strong>ADMIN SESSION DEBUG</strong>
        <p style={{ margin: "8px 0 0" }}>
          Current session email: <strong>{sessionEmail ?? "none"}</strong> · isAdmin: <strong>{String(sessionIsAdmin)}</strong>
        </p>
      </div>
      {archiveTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-customer-title"
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
              setArchiveTarget(null);
              setArchiveConfirmText("");
            }
          }}
        >
          <div className="card" style={{ maxWidth: 520, width: "100%", margin: 16, padding: 16 }}>
            <h3 id="archive-customer-title" style={{ marginTop: 0 }}>
              Archive customer
            </h3>
            <p className="muted" style={{ marginTop: 0 }}>
              This safely archives the customer subscription and removes it from the main customer list.
            </p>
            <p style={{ marginTop: 0 }}>
              Customer: <strong>{archiveTarget.email ?? archiveTarget.workspaceId}</strong>
            </p>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted">Type ARCHIVE to confirm</span>
              <input
                className="input"
                value={archiveConfirmText}
                onChange={(e) => setArchiveConfirmText(e.target.value)}
                placeholder="ARCHIVE"
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setArchiveTarget(null);
                  setArchiveConfirmText("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={archiveConfirmText.trim().toUpperCase() !== "ARCHIVE"}
                onClick={() => {
                  if (!archiveTarget) return;
                  void archiveCustomer(archiveTarget);
                  setArchiveTarget(null);
                  setArchiveConfirmText("");
                }}
              >
                Archive customer
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <h2 style={{ marginTop: 0 }}>Customers</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Main list shows paid/subscribed customers from subscription records only.
      </p>
      <div style={{ display: "flex", gap: 24, marginBottom: 12, flexWrap: "wrap" }}>
        <span>Active Customers: <strong>{summary.activeCustomers}</strong></span>
        <span>New This Week: <strong>{summary.newThisWeek}</strong></span>
        <span>Canceled This Week: <strong>{summary.canceledThisWeek}</strong></span>
      </div>
      <div className="card" style={{ marginBottom: 12, border: "2px solid #d4b400" }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>ADMIN CUSTOMER CONTROLS DEBUG</h3>
        <p style={{ marginTop: 0 }}>
          Total customers loaded: <strong>{rows.length}</strong>
        </p>
        {debugRows.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>No customer rows loaded yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {debugRows.map((row) => (
              <div key={`debug-customer-${row.id}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                <strong>{row.email ?? "Unknown email"}</strong>
                <code>{row.workspaceId}</code>
                <a href={`/admin/customers/${row.workspaceId}`} style={hardBtnStyle}>View</a>
                <button style={hardBtnStyle} type="button" onClick={() => startEdit(row)}>Edit</button>
                <button type="button" style={{ ...hardBtnStyle, color: "#a40000", borderColor: "#a40000" }} onClick={() => setArchiveTarget(row)}>
                  Archive
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Admin controls</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button className="btn btn-primary" onClick={startCreate} type="button">Add customer</button>
          <button className="btn btn-ghost" onClick={() => void load()} type="button">Refresh</button>
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          <input className="input" placeholder="Customer email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <input className="input" placeholder="Plan / stripe price id" value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))} />
          <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            {statusOptions.filter((s) => s !== "all").map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input className="input" placeholder="Stripe customer id" value={form.stripeCustomerId} onChange={(e) => setForm((f) => ({ ...f, stripeCustomerId: e.target.value }))} />
          <input className="input" placeholder="Stripe subscription id" value={form.stripeSubscriptionId} onChange={(e) => setForm((f) => ({ ...f, stripeSubscriptionId: e.target.value }))} />
          <input className="input" type="date" value={form.renewalDate} onChange={(e) => setForm((f) => ({ ...f, renewalDate: e.target.value }))} />
          <input className="input" placeholder="Full name (optional)" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          <input className="input" placeholder="Internal notes" value={form.adminNotes} onChange={(e) => setForm((f) => ({ ...f, adminNotes: e.target.value }))} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {selected ? (
            <>
              <button className="btn btn-primary" onClick={() => void saveCustomer()} type="button">Save customer</button>
              <button className="btn btn-ghost" onClick={startCreate} type="button">Clear edit</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => void createCustomer()} type="button">Create customer</button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input className="input" placeholder="Search customers" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button className="btn btn-ghost" onClick={() => void load()} type="button">Apply filters</button>
      </div>

      {message ? <p>{message}</p> : null}
      {loading ? <p>Loading...</p> : null}
      {!loading && rows.length === 0 ? <p>No subscribed customers found.</p> : null}
      <div className="card" style={{ marginBottom: 12, border: "2px dashed #d4b400" }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Temporary customer action test bar</h3>
        {rows.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>{loading ? "Loading customers..." : "No customer rows available."}</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((row) => (
              <div key={`test-customer-${row.id}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                <strong>{row.email ?? row.workspaceId}</strong>
                <a href={`/admin/customers/${row.workspaceId}`} style={hardBtnStyle}>View</a>
                <button style={hardBtnStyle} type="button" onClick={() => startEdit(row)}>Edit</button>
                <button type="button" style={{ ...hardBtnStyle, color: "#a40000", borderColor: "#a40000" }} onClick={() => setArchiveTarget(row)}>
                  Archive
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {!loading && rows.length > 0 ? (
        <div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 980, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Email</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8, background: "var(--surface, #fff)" }}>Actions</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Customer</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Plan</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Status</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Stripe Customer</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Stripe Subscription</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Renewal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.email ?? "Unknown"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222", whiteSpace: "nowrap", background: "var(--surface, #fff)" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link className="btn btn-ghost" href={`/admin/customers/${row.workspaceId}`}>
                          View
                        </Link>
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => {
                            startEdit(row);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          style={{ color: "var(--error, #e5534b)" }}
                          onClick={() => setArchiveTarget(row)}
                        >
                          Archive
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.creator}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.plan}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.status}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.stripeCustomerId ?? "—"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.stripeSubscriptionId ?? "—"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.renewalDate ? new Date(row.renewalDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>Visible customer actions</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {rows.map((row) => (
                <div key={`actions-${row.id}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                  <strong style={{ minWidth: 240 }}>{row.email ?? row.workspaceId}</strong>
                  <Link className="btn btn-ghost" href={`/admin/customers/${row.workspaceId}`}>View</Link>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      startEdit(row);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Edit
                  </button>
                  <button className="btn btn-ghost" type="button" style={{ color: "var(--error, #e5534b)" }} onClick={() => setArchiveTarget(row)}>
                    Archive
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {recentAccounts.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 8 }}>Recent accounts (not customer source-of-truth)</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 620, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Email</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Signed up</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {recentAccounts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{a.email ?? a.id.slice(0, 8)}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{new Date(a.created_at).toLocaleString()}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{a.isCustomer ? "Converted customer" : "Unconverted signup"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

