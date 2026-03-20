"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  acquisitionSource: string | null;
  subjectId: string | null;
  subscription: Subscription;
  stripeCustomerId: string | null;
  training: TrainingInfo;
  generations: GenerationRow[];
  assets: { path: string; createdAt: string; requestId?: string }[];
  failures: FailureRow[];
  posts: PostRow[];
  subjectsForVault: SubjectRow[];
};

export default function AdminCustomerDetailClient({
  workspaceId,
  email,
  fullName,
  acquisitionSource,
  subjectId,
  subscription,
  stripeCustomerId,
  training,
  generations,
  assets,
  failures,
  posts,
  subjectsForVault,
}: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
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

  async function unpublishPost(postId: string) {
    setMessage("");
    try {
      const res = await fetch(`/api/admin/posts/${postId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) { setMessage(data.error ?? "Failed to unpublish"); return; }
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
        if (!res.ok) { setMessage((json as { error?: string }).error ?? "Failed to retry"); return; }
        setMessage("Generation queued.");
      } else {
        setMessage("Retry training: use Training API.");
      }
    } finally {
      setLoading(null);
    }
  }

  async function saveCustomerOverview() {
    setMessage("Saving…");
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
    setMessage(res.ok ? "Saved." : (data.error ?? "Failed to save"));
  }

  async function hardDelete() {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") return;
    setDeleting(true);
    setMessage("");
    const res = await fetch("/api/admin/customers/hard-delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, confirmText: "DELETE", userEmail: email }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setDeleting(false);
      setMessage(data.error ?? "Delete failed");
      return;
    }
    router.push("/admin/customers");
  }

  const planLabel = subscription?.stripe_price_id ? "Subscription" : "—";
  const statusLabel =
    subscription?.status === "trialing" ? "Trial" :
    subscription?.status === "active" ? "Active" :
    subscription?.status === "past_due" ? "Past Due" :
    subscription?.status === "canceled" ? "Canceled" :
    subscription?.status ?? "—";

  const sourceLabel =
    acquisitionSource === "direct" ? "Direct signup" :
    acquisitionSource === "referral" ? "Referral link" :
    acquisitionSource === "scraper" ? "Lead (scraper)" :
    acquisitionSource ?? "Unknown";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Hard delete modal */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) { setShowDeleteModal(false); setDeleteConfirmText(""); }
          }}
        >
          <div className="card" style={{ maxWidth: 520, width: "100%", margin: 16, padding: 20, border: "1px solid rgba(239,68,68,0.4)" }}>
            <h3 style={{ marginTop: 0, color: "#ef4444" }}>Delete customer permanently?</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              This permanently deletes the user account, all uploads, generated content, training data, and subscription records.
              <strong style={{ color: "#ef4444" }}> This cannot be undone.</strong>
            </p>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted">Type DELETE to confirm</span>
              <input
                className="input"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}
              >
                Cancel
              </button>
              <button
                className="btn"
                type="button"
                disabled={deleteConfirmText.trim().toUpperCase() !== "DELETE" || deleting}
                onClick={() => void hardDelete()}
                style={{ background: "#ef4444", color: "#fff", border: "none", opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {message ? <p style={{ margin: 0, color: "var(--color-muted)" }}>{message}</p> : null}

      {/* Customer overview */}
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
              <span className="muted">Acquisition source</span>
              <input className="input" value={sourceLabel} readOnly />
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
            <button type="button" className="btn btn-primary" onClick={() => setCustomerForm((f) => ({ ...f, status: "active" }))}>
              Set active
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setCustomerForm((f) => ({ ...f, status: "past_due" }))}>
              Set past due
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setCustomerForm((f) => ({ ...f, status: "canceled" }))}>
              Set canceled
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setShowDeleteModal(true)}
              style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
            >
              Delete customer
            </button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Status: <strong>{statusLabel}</strong> · Plan: <strong>{planLabel}</strong>
        </p>
      </div>

      {/* Content moderation */}
      {postList.length > 0 && (
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Content</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {postList.map((p) => (
              <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span className="muted" style={{ fontSize: 13 }}>
                  {p.created_at.slice(0, 10)} · {p.visibility} · {p.is_published ? "Published" : "Unpublished"}
                </span>
                {p.is_published && (
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => void unpublishPost(p.id)}>
                    Unpublish
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Subject / consent */}
      <div>
        <AdminSubjectsSection initialSubjects={subjectsForVault} workspaceId={workspaceId} />
      </div>

      {/* Identity verification */}
      {subjectId && (
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
                setMessage(res.ok ? "Identity approved." : (data.error ?? "Failed"));
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Failed");
              }
            }}
          >
            Approve identity
          </button>
        </div>
      )}

      {/* Dataset + Training */}
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
              <td style={{ padding: 4 }}>{training.lastTrainingDate ? new Date(training.lastTrainingDate).toLocaleString() : "—"}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 500 }}>Active Model Version</td>
              <td style={{ padding: 4 }}>{training.activeModelVersion ?? "—"}</td>
            </tr>
          </tbody>
        </table>
        {(training.trainingStatus === "failed" || training.trainingStatus === "Failed") && (
          <button type="button" className="btn btn-primary" onClick={() => retryJob("training", workspaceId)} disabled={loading !== null} style={{ marginTop: 8 }}>
            Retry training
          </button>
        )}
      </div>

      {/* Generations summary */}
      <div>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Generations</h3>
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
                    <td style={{ padding: 8, borderBottom: "1px solid #222", fontSize: 12 }}><code>{g.id.slice(0, 8)}…</code></td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{g.scene_preset}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{g.status}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{new Date(g.created_at).toLocaleString()}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                      {(g.status === "failed" || g.status === "rejected") && (
                        <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => retryJob("generation", g.id)} disabled={loading !== null}>
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

      {/* Assets */}
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

      {/* Failures */}
      {failures.length > 0 && (
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Failures</h3>
          <ul style={{ paddingLeft: 20 }}>
            {failures.map((f) => (
              <li key={f.id}>
                <strong>{f.type}</strong>: {f.message}
                {f.lastError ? ` — ${f.lastError}` : ""}
                <button type="button" className="btn btn-primary" style={{ fontSize: 12, marginLeft: 8 }} onClick={() => retryJob(f.type, f.id)} disabled={loading !== null}>
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
