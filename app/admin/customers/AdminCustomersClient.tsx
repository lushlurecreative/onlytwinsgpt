"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PACKAGE_PLANS, type PlanKey } from "@/lib/package-plans";

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

type PaymentLinkRow = {
  id: string;
  email: string;
  plan: string;
  checkoutUrl: string | null;
  fullName: string | null;
  adminNotes: string | null;
  createdAt: string;
  stripeCheckoutSessionId: string | null;
};

type AllUserRow = {
  id: string;
  email: string | null;
  createdAt: string | null;
  isAdmin: boolean;
  isPaidCustomer: boolean;
};

type Props = {
  initialSessionEmail: string | null;
  initialIsAdmin: boolean;
};

const PLAN_KEYS: PlanKey[] = [
  "starter",
  "professional",
  "elite",
  "single_batch",
  "partner_70_30",
  "partner_50_50",
];

export default function AdminCustomersClient({ initialSessionEmail: _initialSessionEmail, initialIsAdmin: _initialIsAdmin }: Props) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ activeCustomers: 0, newThisWeek: 0, canceledThisWeek: 0 });
  const [paymentLinks, setPaymentLinks] = useState<PaymentLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentLinksLoading, setPaymentLinksLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CustomerRow | null>(null);
  const [archiveConfirmText, setArchiveConfirmText] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [archivingCustomer, setArchivingCustomer] = useState(false);
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
  const [payLinkForm, setPayLinkForm] = useState({
    email: "",
    plan: "" as PlanKey | "",
    fullName: "",
    adminNotes: "",
  });
  const [createdPaymentLink, setCreatedPaymentLink] = useState<{ url: string; id: string } | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [deletePaymentLinkTarget, setDeletePaymentLinkTarget] = useState<PaymentLinkRow | null>(null);
  const [deletingPaymentLink, setDeletingPaymentLink] = useState(false);
  const [allUsers, setAllUsers] = useState<AllUserRow[]>([]);
  const [allUsersLoading, setAllUsersLoading] = useState(true);
  const [deleteUserTarget, setDeleteUserTarget] = useState<AllUserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    const res = await fetch(`/api/admin/customers?${params.toString()}`);
    const json = (await res.json().catch(() => ({}))) as {
      customers?: CustomerRow[];
      summary?: Summary;
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
    setLoading(false);
  }

  async function loadPaymentLinks() {
    setPaymentLinksLoading(true);
    const res = await fetch("/api/admin/payment-links");
    const json = (await res.json().catch(() => ({}))) as { paymentLinks?: PaymentLinkRow[]; error?: string };
    if (!res.ok) {
      setPaymentLinks([]);
      setPaymentLinksLoading(false);
      return;
    }
    setPaymentLinks(json.paymentLinks ?? []);
    setPaymentLinksLoading(false);
  }

  async function loadAllUsers() {
    setAllUsersLoading(true);
    const res = await fetch("/api/admin/users");
    const json = (await res.json().catch(() => ({}))) as { users?: AllUserRow[]; error?: string };
    if (!res.ok) {
      setAllUsers([]);
      setAllUsersLoading(false);
      return;
    }
    setAllUsers(json.users ?? []);
    setAllUsersLoading(false);
  }

  useEffect(() => {
    const tid = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(tid);
  }, []);

  useEffect(() => {
    const tid = setTimeout(() => {
      loadPaymentLinks();
    }, 0);
    return () => clearTimeout(tid);
  }, []);

  useEffect(() => {
    const tid = setTimeout(() => {
      loadAllUsers();
    }, 0);
    return () => clearTimeout(tid);
  }, []);

  const statusOptions = useMemo(
    () => ["all", "active", "trialing", "past_due", "canceled", "incomplete", "needs_review", "expired"],
    []
  );

  const paidEmails = useMemo(() => new Set(rows.map((r) => (r.email ?? "").toLowerCase())), [rows]);
  const awaitingPayment = useMemo(
    () => paymentLinks.filter((pl) => !paidEmails.has(pl.email.toLowerCase())),
    [paymentLinks, paidEmails]
  );
  const nonAdminUsers = useMemo(
    () => allUsers.filter((u) => !u.isAdmin),
    [allUsers]
  );

  async function deleteUserByEmail(userRow: AllUserRow) {
    if (!userRow.email) return;
    setDeletingUser(true);
    const res = await fetch("/api/admin/user-reset/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userRow.email }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setDeletingUser(false);
    setDeleteUserTarget(null);
    if (!res.ok) {
      setMessage(json.error ?? "Delete failed");
      return;
    }
    setMessage("User deleted.");
    await loadAllUsers();
    await load();
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
    setShowEditModal(true);
    setMessage(`Editing customer: ${row.email ?? row.workspaceId}`);
  }

  async function createPaymentLink() {
    if (!payLinkForm.email.trim()) {
      setMessage("Email is required.");
      return;
    }
    if (!payLinkForm.plan) {
      setMessage("Please select a plan.");
      return;
    }
    setCreatingLink(true);
    setMessage("Creating payment link...");
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
    const json = (await res.json().catch(() => ({}))) as { url?: string; id?: string; error?: string };
    setCreatingLink(false);
    if (!res.ok) {
      setMessage(json.error ?? "Failed to create payment link");
      return;
    }
    setCreatedPaymentLink({ url: json.url ?? "", id: json.id ?? "" });
    setMessage("Payment link created. Copy or open the link below.");
    setPayLinkForm((f) => ({ ...f, email: "", plan: "" as PlanKey | "", fullName: "", adminNotes: "" }));
    await loadPaymentLinks();
  }

  async function deletePaymentLink(pl: PaymentLinkRow) {
    setDeletingPaymentLink(true);
    const res = await fetch(`/api/admin/payment-links/${pl.id}`, { method: "DELETE" });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setDeletingPaymentLink(false);
    setDeletePaymentLinkTarget(null);
    if (!res.ok) {
      setMessage(json.error ?? "Failed to delete");
      return;
    }
    setMessage("Payment link removed.");
    await loadPaymentLinks();
  }

  async function saveCustomer() {
    if (!selected) return;
    setSavingCustomer(true);
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
      setSavingCustomer(false);
      return;
    }
    setMessage("Customer updated successfully");
    await load();
    setSavingCustomer(false);
    setShowEditModal(false);
    setSelected(null);
  }

  function openArchiveModal(row: CustomerRow) {
    setArchiveTarget(row);
    setArchiveConfirmText("");
  }

  async function archiveCustomer(row: CustomerRow) {
    setArchivingCustomer(true);
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
      setArchivingCustomer(false);
      return;
    }
    setMessage("Customer archived successfully");
    await load();
    setArchivingCustomer(false);
    setArchiveTarget(null);
    setArchiveConfirmText("");
  }

  async function copyToClipboard(text: string) {
    if (!text?.trim()) {
      setMessage("No link to copy.");
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setMessage("Link copied.");
        return;
      }
    } catch {
      // Fall through to fallback
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (ok) {
        setMessage("Link copied.");
      } else {
        setMessage("Copy failed. Select the link above and copy manually.");
      }
    } catch {
      setMessage("Copy failed. Select the link above and copy manually.");
    }
  }

  return (
    <section>
      {/* ——— Section A: Add customer and send payment link ——— */}
      <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: "1.25rem" }}>Add customer and send payment link</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
        Create a manual customer entry and generate a pay-now checkout link. When they pay, they become a paid customer.
      </p>
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Customer email"
            value={payLinkForm.email}
            onChange={(e) => setPayLinkForm((f) => ({ ...f, email: e.target.value }))}
          />
          <select
            className="input"
            value={payLinkForm.plan}
            onChange={(e) => setPayLinkForm((f) => ({ ...f, plan: e.target.value as PlanKey }))}
          >
            <option value="">Select plan</option>
            {PLAN_KEYS.map((key) => (
              <option key={key} value={key}>
                {PACKAGE_PLANS[key].name} — {PACKAGE_PLANS[key].displayPrice}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Full name (optional)"
            value={payLinkForm.fullName}
            onChange={(e) => setPayLinkForm((f) => ({ ...f, fullName: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Internal notes (optional)"
            value={payLinkForm.adminNotes}
            onChange={(e) => setPayLinkForm((f) => ({ ...f, adminNotes: e.target.value }))}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            className="btn btn-primary"
            type="button"
            disabled={creatingLink || !payLinkForm.email.trim() || !payLinkForm.plan}
            onClick={() => void createPaymentLink()}
          >
            {creatingLink ? "Creating…" : "Create and generate payment link"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        {createdPaymentLink?.url ? (
          <div style={{ marginTop: 16, padding: 12, background: "var(--surface, #f5f5f5)", borderRadius: 8 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Payment link created</p>
            <input
              className="input"
              readOnly
              value={createdPaymentLink.url}
              style={{ width: "100%", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void copyToClipboard(createdPaymentLink.url)}
              >
                Copy link
              </button>
              <a
                href={createdPaymentLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
              >
                Open link
              </a>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setCreatedPaymentLink(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ——— Section B: Awaiting payment ——— */}
      <h2 style={{ marginTop: 8, marginBottom: 8, fontSize: "1.25rem" }}>Awaiting payment</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: 10 }}>
        Manual pay-now links that have not yet been paid. Once paid, the customer appears in Paid customers below.
      </p>
      {paymentLinksLoading ? (
        <p className="muted">Loading…</p>
      ) : awaitingPayment.length === 0 ? (
        <p className="muted">No pending payment links.</p>
      ) : (
        <div className="card" style={{ marginBottom: 24, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 640, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Email</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Plan</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Created</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {awaitingPayment.map((pl) => (
                <tr key={pl.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{pl.email}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{pl.plan}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {new Date(pl.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222", whiteSpace: "nowrap" }}>
                    {pl.checkoutUrl ? (
                      <>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => void copyToClipboard(pl.checkoutUrl ?? "")}
                        >
                          Copy pay link
                        </button>
                        <a
                          href={pl.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost"
                        >
                          Open pay link
                        </a>
                      </>
                    ) : (
                      <span className="muted">Link expired</span>
                    )}
                    <button
                      className="btn btn-ghost"
                      type="button"
                      style={{ color: "var(--error, #e5534b)" }}
                      onClick={() => setDeletePaymentLinkTarget(pl)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ——— Users / test accounts (all non-admin auth users) ——— */}
      <h2 style={{ marginTop: 24, marginBottom: 8, fontSize: "1.25rem" }}>Users / test accounts</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: 10 }}>
        All non-admin auth users (including non-paying, orphaned, and test accounts). Use{" "}
        <Link href="/admin/user-reset">User reset tools</Link> to delete single user or all test users.
      </p>
      {allUsersLoading ? (
        <p className="muted">Loading…</p>
      ) : nonAdminUsers.length === 0 ? (
        <p className="muted">No non-admin users.</p>
      ) : (
        <div className="card" style={{ marginBottom: 24, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 560, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Email</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Signed up</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Status</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {nonAdminUsers.map((u) => (
                <tr key={u.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{u.email ?? u.id.slice(0, 8)}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {u.isPaidCustomer ? "Paid customer" : "Test / non-customer"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222", whiteSpace: "nowrap" }}>
                    <Link className="btn btn-ghost" href={`/admin/customers/${u.id}`}>
                      View
                    </Link>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      style={{ color: "var(--error, #e5534b)" }}
                      onClick={() => setDeleteUserTarget(u)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteUserTarget ? (
        <div
          role="dialog"
          aria-modal="true"
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
            if (e.target === e.currentTarget && !deletingUser) setDeleteUserTarget(null);
          }}
        >
          <div className="card" style={{ maxWidth: 420, margin: 16, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Delete user completely</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              This permanently removes the user and all their data (auth, profile, subscriptions, subjects, generation requests, posts, etc.).
            </p>
            <p style={{ marginTop: 0 }}>
              <strong>{deleteUserTarget.email ?? deleteUserTarget.id}</strong>
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={deletingUser}
                onClick={() => setDeleteUserTarget(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                style={{ background: "var(--error, #e5534b)", borderColor: "var(--error, #e5534b)" }}
                disabled={deletingUser}
                onClick={() => void deleteUserByEmail(deleteUserTarget)}
              >
                {deletingUser ? "Deleting…" : "Delete user"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deletePaymentLinkTarget ? (
        <div
          role="dialog"
          aria-modal="true"
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
            if (e.target === e.currentTarget && !deletingPaymentLink) setDeletePaymentLinkTarget(null);
          }}
        >
          <div className="card" style={{ maxWidth: 400, margin: 16, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Remove payment link</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Remove this pending link from the list. This does not cancel the Stripe session.
            </p>
            <p style={{ marginTop: 0 }}>
              <strong>{deletePaymentLinkTarget.email}</strong> — {deletePaymentLinkTarget.plan}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={deletingPaymentLink}
                onClick={() => setDeletePaymentLinkTarget(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                style={{ background: "var(--error, #e5534b)", borderColor: "var(--error, #e5534b)" }}
                disabled={deletingPaymentLink}
                onClick={() => void deletePaymentLink(deletePaymentLinkTarget)}
              >
                {deletingPaymentLink ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ——— Section C: Paid customers ——— */}
      <h2 style={{ marginTop: 8, marginBottom: 8, fontSize: "1.25rem" }}>Paid customers</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: 10 }}>
        Customers with active or tracked subscription records.
      </p>
      <div style={{ display: "flex", gap: 24, marginBottom: 8, flexWrap: "wrap" }}>
        <span>Active: <strong>{summary.activeCustomers}</strong></span>
        <span>New this week: <strong>{summary.newThisWeek}</strong></span>
        <span>Canceled this week: <strong>{summary.canceledThisWeek}</strong></span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="Search customers"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button className="btn btn-ghost" type="button" onClick={() => void load()}>
          Apply filters
        </button>
      </div>

      {message ? <p>{message}</p> : null}
      {loading ? <p>Loading…</p> : null}
      {!loading && rows.length === 0 ? <p>No paid customers found.</p> : null}
      {!loading && rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 800, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Email</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Plan</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Status</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Renewal / period end</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.email ?? "—"}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.plan}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.status}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {row.renewalDate ? new Date(row.renewalDate).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222", whiteSpace: "nowrap" }}>
                    <Link className="btn btn-ghost" href={`/admin/customers/${row.workspaceId}`}>
                      View
                    </Link>
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => startEdit(row)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      style={{ color: "var(--error, #e5534b)" }}
                      onClick={() => openArchiveModal(row)}
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Edit customer modal */}
      {showEditModal && selected ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-customer-title"
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
            if (e.target === e.currentTarget) setShowEditModal(false);
          }}
        >
          <div className="card" style={{ maxWidth: 900, width: "100%", margin: 16, padding: 16 }}>
            <h3 id="edit-customer-title" style={{ marginTop: 0 }}>Edit customer</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Editing: <strong>{selected.email ?? selected.workspaceId}</strong>
            </p>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
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
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn btn-ghost" type="button" onClick={() => setShowEditModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => void saveCustomer()} type="button" disabled={savingCustomer || !selected}>
                {savingCustomer ? "Saving…" : "Save customer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Archive customer modal */}
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
            <h3 id="archive-customer-title" style={{ marginTop: 0 }}>Archive customer</h3>
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
                disabled={archiveConfirmText.trim().toUpperCase() !== "ARCHIVE" || archivingCustomer}
                onClick={() => {
                  if (!archiveTarget) return;
                  void archiveCustomer(archiveTarget);
                }}
              >
                {archivingCustomer ? "Archiving…" : "Archive customer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
