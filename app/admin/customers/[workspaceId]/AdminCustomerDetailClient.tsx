"use client";

import { useState } from "react";
import AdminGenerationRequestsSection from "./AdminGenerationRequestsSection";
import AdminSubjectsSection, { type SubjectRow } from "./AdminSubjectsSection";

type Subscription = {
  id: string;
  status: string;
  stripe_price_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  admin_notes: string | null;
} | null;

type GenerationRow = {
  id: string;
  scene_preset: string;
  status: string;
  created_at: string;
  output_paths: string[];
};

type TrainingInfo = {
  datasetStatus: string;
  trainingStatus: string;
  lastTrainingDate: string | null;
  activeModelVersion: string | null;
};

type FailureRow = {
  id: string;
  type: "training" | "generation";
  message: string;
  lastError?: string;
};

type PostRow = {
  id: string;
  caption: string | null;
  is_published: boolean;
  visibility: string;
  created_at: string;
};

type Props = {
  workspaceId: string;
  email: string | null;
  fullName: string | null;
  subjectId: string | null;
  subscription: Subscription;
  stripeCustomerId: string | null;
  training: TrainingInfo;
  generations: GenerationRow[];
  assets: { path: string; createdAt: string; requestId?: string }[];
  failures: FailureRow[];
  suspendedAt: string | null;
  posts: PostRow[];
  subjectsForVault: SubjectRow[];
};

export default function AdminCustomerDetailClient({
  workspaceId,
  email,
  fullName,
  subjectId,
  subscription,
  stripeCustomerId,
  training,
  generations,
  assets,
  failures,
  suspendedAt,
  posts,
  subjectsForVault,
}: Props) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [suspended, setSuspended] = useState(!!suspendedAt);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveConfirmText, setArchiveConfirmText] = useState("");
  const [postList, setPostList] = useState(posts);
  const [customerForm, setCustomerForm] = useState({
    fullName: fullName ?? "",
    status: subscription?.status ?? "active",
    stripePriceId: subscription?.stripe_price_id ?? "",
    stripeCustomerId: stripeCustomerId ?? "",
    stripeSubscriptionId: subscription?.stripe_subscription_id ?? "",
    currentPeriodEnd: subscription?.current_period_end ? subscription.current_period_end.slice(0, 10) : "",
    adminNotes: subscription?.admin_notes ?? "",
  });

  async function toggleSuspend() {
    setMessage("");
    try {
      const res = await fetch(`/api/admin/users/${workspaceId}/suspend`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: !suspended }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Failed");
        return;
      }
      setSuspended(!suspended);
      setMessage(suspended ? "User unsuspended." : "User suspended.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  async function unpublishPost(postId: string) {
    setMessage("");
    try {
      const res = await fetch(`/api/admin/posts/${postId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Failed to unpublish");
        return;
      }
      setPostList((prev) => prev.map((p) => (p.id === postId ? { ...p, is_published: false } : p)));
      setMessage("Post unpublished.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  async function retryJob(type: "training" | "generation", id: string) {
    setLoading(id);
    setMessage("");
    try {
      if (type === "generation") {
        const res = await fetch(`/api/admin/generation-requests/${id}/generate`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage((json as { error?: string }).error ?? "Failed to retry");
          return;
        }
        setMessage("Generation queued.");
      } else {
        setMessage("Retry training: use Training API when available.");
      }
    } finally {
      setLoading(null);
    }
  }

  async function saveCustomerOverview() {
    setMessage("Saving customer...");
    const res = await fetch(`/api/admin/customers/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: customerForm.fullName || null,
        status: customerForm.status,
        stripePriceId: customerForm.stripePriceId || null,
        stripeCustomerId: customerForm.stripeCustomerId || null,
        stripeSubscriptionId: customerForm.stripeSubscriptionId || null,
        currentPeriodEnd: customerForm.currentPeriodEnd ? new Date(customerForm.currentPeriodEnd).toISOString() : null,
        adminNotes: customerForm.adminNotes || null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to save customer");
      return;
    }
    setMessage("Customer updated.");
  }

  async function archiveCustomer() {
    setMessage("Archiving customer...");
    const res = await fetch(`/api/admin/customers/${workspaceId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmText: "ARCHIVE" }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to archive customer");
      return;
    }
    setMessage("Customer archived.");
  }

  const planLabel = subscription?.stripe_price_id ? "Subscription" : "—";
  const statusLabel =
    subscription?.status === "trialing"
      ? "Trial"
      : subscription?.status === "active"
        ? "Active"
        : subscription?.status === "past_due"
          ? "Past Due"
          : subscription?.status === "canceled"
            ? "Canceled"
            : subscription?.status ?? "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {showArchiveModal ? (
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
              setShowArchiveModal(false);
              setArchiveConfirmText("");
            }
          }}
        >
          <div className="card" style={{ maxWidth: 520, width: "100%", margin: 16, padding: 16 }}>
            <h3 id="archive-customer-title" style={{ marginTop: 0 }}>
              Archive customer
            </h3>
            <p className="muted" style={{ marginTop: 0 }}>
              This cancels and archives the customer subscription.
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
                  setShowArchiveModal(false);
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
                  void archiveCustomer();
                  setShowArchiveModal(false);
                  setArchiveConfirmText("");
                }}
              >
                Archive customer
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {message ? <p style={{ margin: 0, color: "var(--color-muted)" }}>{message}</p> : null}

      {/* Moderation */}
      <div>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Moderation</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className={suspended ? "btn btn-ghost" : "btn"}
            style={suspended ? undefined : { color: "var(--error, #e5534b)" }}
            onClick={() => void toggleSuspend()}
          >
            {suspended ? "Unsuspend user" : "Suspend user"}
          </button>
          {suspended ? <span className="muted">User is suspended and cannot access creator areas.</span> : null}
        </div>
        {postList.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ marginBottom: 8 }}>Posts (content removal)</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {postList.map((p) => (
                <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {p.created_at.slice(0, 10)} · {p.visibility} · {p.is_published ? "Published" : "Unpublished"}
                  </span>
                  {p.is_published ? (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => void unpublishPost(p.id)}>
                      Unpublish
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Section A: Subscription */}
      <div>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Customer overview</h3>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted">Email</span>
              <input className="input" value={email ?? ""} readOnly />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted">Full name</span>
              <input className="input" value={customerForm.fullName} onChange={(e) => setCustomerForm((f) => ({ ...f, fullName: e.target.value }))} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted">Status</span>
              <select className="input" value={customerForm.status} onChange={(e) => setCustomerForm((f) => ({ ...f, status: e.target.value }))}>
                {["active", "trialing", "past_due", "canceled", "incomplete", "needs_review", "expired"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted">Plan (Stripe price ID)</span>
              <input className="input" value={customerForm.stripePriceId} onChange={(e) => setCustomerForm((f) => ({ ...f, stripePriceId: e.target.value }))} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted">Stripe customer ID</span>
              <input className="input" value={customerForm.stripeCustomerId} onChange={(e) => setCustomerForm((f) => ({ ...f, stripeCustomerId: e.target.value }))} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted">Stripe subscription ID</span>
              <input className="input" value={customerForm.stripeSubscriptionId} onChange={(e) => setCustomerForm((f) => ({ ...f, stripeSubscriptionId: e.target.value }))} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted">Renewal / current period end</span>
              <input className="input" type="date" value={customerForm.currentPeriodEnd} onChange={(e) => setCustomerForm((f) => ({ ...f, currentPeriodEnd: e.target.value }))} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted">Admin notes</span>
              <textarea className="input" value={customerForm.adminNotes} onChange={(e) => setCustomerForm((f) => ({ ...f, adminNotes: e.target.value }))} rows={3} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" onClick={() => void saveCustomerOverview()}>
              Save changes
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setCustomerForm((f) => ({ ...f, status: "active" }))}>
              Set active
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setCustomerForm((f) => ({ ...f, status: "past_due" }))}>
              Set past due
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setCustomerForm((f) => ({ ...f, status: "canceled" }))}>
              Set canceled
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowArchiveModal(true)}>
              Archive customer
            </button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Current status: <strong>{statusLabel}</strong> · Current plan: <strong>{planLabel}</strong>
        </p>
      </div>

      {/* Subject (Vault) / consent */}
      <div>
        <AdminSubjectsSection initialSubjects={subjectsForVault} />
      </div>

      {/* Identity verification (Phase D) */}
      {subjectId ? (
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Identity verification</h3>
          <p className="muted" style={{ marginBottom: 8 }}>Approve identity for this subject so training can proceed.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              setMessage("");
              try {
                const res = await fetch(`/api/admin/subjects/${subjectId}/verify-identity`, { method: "POST" });
                const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                if (!res.ok) {
                  setMessage(data.error ?? "Failed");
                  return;
                }
                setMessage("Identity approved.");
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Failed");
              }
            }}
          >
            Approve identity
          </button>
        </div>
      ) : null}

      {/* Section B: Dataset + Training */}
      <div>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Dataset &amp; Training</h3>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 500 }}>Dataset Status</td>
              <td style={{ padding: 4 }}>{training.datasetStatus}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 500 }}>Training Status</td>
              <td style={{ padding: 4 }}>{training.trainingStatus}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 500 }}>Last Training Date</td>
              <td style={{ padding: 4 }}>
                {training.lastTrainingDate
                  ? new Date(training.lastTrainingDate).toLocaleString()
                  : "—"}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 500 }}>Active Model Version</td>
              <td style={{ padding: 4 }}>{training.activeModelVersion ?? "—"}</td>
            </tr>
          </tbody>
        </table>
        {(training.trainingStatus === "failed" || training.trainingStatus === "Failed") && (
          <button
            type="button"
            onClick={() => retryJob("training", workspaceId)}
            disabled={loading !== null}
            style={{ marginTop: 8 }}
          >
            Retry training
          </button>
        )}
      </div>

      {/* Section C: Generations (summary) + full generation requests section */}
      <div>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Generations (summary)</h3>
        {generations.length === 0 ? (
          <p className="muted">No generation jobs.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 520, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Job ID</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Preset</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Status</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Created</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {generations.map((g) => (
                  <tr key={g.id}>
                    <td style={{ padding: 8, borderBottom: "1px solid #222", fontSize: 12 }}>
                      <code>{g.id.slice(0, 8)}…</code>
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{g.scene_preset}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{g.status}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                      {new Date(g.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                      {(g.status === "failed" || g.status === "rejected") && (
                        <button
                          type="button"
                          onClick={() => retryJob("generation", g.id)}
                          disabled={loading !== null}
                          style={{ marginRight: 8 }}
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <AdminGenerationRequestsSection workspaceId={workspaceId} />
      </div>

      {/* Section D: Assets (Vault) */}
      <div>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Assets (Vault)</h3>
        {assets.length === 0 ? (
          <p className="muted">No stored outputs.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexWrap: "wrap", gap: 12 }}>
            {assets.map((a, i) => (
              <li key={a.path + i} style={{ border: "1px solid #333", borderRadius: 8, padding: 8, maxWidth: 200 }}>
                <div style={{ fontSize: 12, wordBreak: "break-all" }}>{a.path.split("/").pop() ?? a.path}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{new Date(a.createdAt).toLocaleString()}</div>
                <a href={`/api/admin/customers/signed-url?path=${encodeURIComponent(a.path)}`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                  Signed link
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Section E: Failures */}
      {failures.length > 0 && (
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Failures</h3>
          <ul style={{ paddingLeft: 20 }}>
            {failures.map((f) => (
              <li key={f.id}>
                <strong>{f.type}</strong>: {f.message}
                {f.lastError ? ` — ${f.lastError}` : ""}
                <button
                  type="button"
                  onClick={() => retryJob(f.type, f.id)}
                  disabled={loading !== null}
                  style={{ marginLeft: 8 }}
                >
                  Retry
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
