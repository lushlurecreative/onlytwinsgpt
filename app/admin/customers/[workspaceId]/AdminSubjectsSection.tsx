"use client";

import { useState } from "react";

export type SubjectRow = {
  id: string;
  user_id: string;
  label: string | null;
  consent_status: string;
  consent_signed_at: string | null;
  identity_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type Props = { initialSubjects: SubjectRow[]; workspaceId: string };

export default function AdminSubjectsSection({ initialSubjects, workspaceId }: Props) {
  const [subjects, setSubjects] = useState(initialSubjects);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [training, setTraining] = useState(false);
  const [message, setMessage] = useState("");

  async function updateConsent(subjectId: string, consent_status: "pending" | "approved" | "revoked") {
    setUpdatingId(subjectId);
    setMessage("");
    try {
      const r = await fetch(`/api/subjects/${subjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent_status,
          consent_signed_at: consent_status === "approved" ? new Date().toISOString() : null,
          identity_verified_at: consent_status === "approved" ? new Date().toISOString() : null,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setMessage(data.error ?? "Update failed");
        return;
      }
      setSubjects((prev) =>
        prev.map((s) =>
          s.id === subjectId
            ? {
                ...s,
                consent_status: data.subject?.consent_status ?? s.consent_status,
                consent_signed_at: data.subject?.consent_signed_at ?? s.consent_signed_at,
                identity_verified_at: data.subject?.identity_verified_at ?? s.identity_verified_at,
              }
            : s
        )
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function createSubject() {
    setCreating(true);
    setMessage("");
    try {
      const r = await fetch(`/api/admin/users/${workspaceId}/subject`, { method: "POST" });
      const data = await r.json() as { subject?: SubjectRow & { id: string; created?: boolean }; error?: string };
      if (!r.ok) {
        setMessage(data.error ?? "Failed to create subject");
        return;
      }
      setMessage(data.subject?.created ? "Subject created and approved." : "Subject already exists — approved.");
      // Reload subjects by adding a placeholder; page refresh will show full data
      if (data.subject?.id && subjects.length === 0) {
        setSubjects([
          {
            id: data.subject.id,
            user_id: workspaceId,
            label: "Creator",
            consent_status: "approved",
            consent_signed_at: new Date().toISOString(),
            identity_verified_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setCreating(false);
    }
  }

  async function startTraining() {
    setTraining(true);
    setMessage("");
    try {
      const r = await fetch(`/api/admin/users/${workspaceId}/training`, { method: "POST" });
      const data = await r.json() as { job?: { id: string; sample_count: number }; runpod_dispatched?: boolean; error?: string };
      if (!r.ok) {
        setMessage(data.error ?? "Training dispatch failed");
        return;
      }
      const dispatched = data.runpod_dispatched ? " Dispatched to RunPod." : " (RunPod not configured — job queued locally.)";
      setMessage(`Training started with ${data.job?.sample_count ?? "?"} photos.${dispatched}`);
    } finally {
      setTraining(false);
    }
  }

  const hasApprovedSubject = subjects.some((s) => s.consent_status === "approved");

  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>Subject &amp; Training</h3>
      <p className="muted" style={{ marginBottom: 12 }}>
        Manage the creator&apos;s subject (twin identity) and trigger LoRA model training.
      </p>
      {message && (
        <p style={{ color: message.includes("failed") || message.includes("Failed") ? "var(--error, #e5534b)" : "var(--color-muted)", marginBottom: 12 }}>
          {message}
        </p>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #eee" }}>
            <th style={{ padding: 8 }}>ID</th>
            <th style={{ padding: 8 }}>Label</th>
            <th style={{ padding: 8 }}>Consent</th>
            <th style={{ padding: 8 }}>Signed</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8, fontSize: 12 }}>{s.id.slice(0, 8)}…</td>
              <td style={{ padding: 8 }}>{s.label || "—"}</td>
              <td style={{ padding: 8 }}><code>{s.consent_status}</code></td>
              <td style={{ padding: 8, fontSize: 12 }}>
                {s.consent_signed_at ? new Date(s.consent_signed_at).toLocaleString() : "—"}
              </td>
              <td style={{ padding: 8 }}>
                {updatingId === s.id ? (
                  <span>Updating…</span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void updateConsent(s.id, "approved")}
                      disabled={s.consent_status === "approved"}
                      style={{ marginRight: 8 }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateConsent(s.id, "revoked")}
                      disabled={s.consent_status === "revoked"}
                    >
                      Revoke
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {subjects.length === 0 && (
        <p className="muted" style={{ marginBottom: 12 }}>No subject for this customer.</p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {subjects.length === 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void createSubject()}
            disabled={creating}
          >
            {creating ? "Creating…" : "Create & approve subject"}
          </button>
        )}
        {hasApprovedSubject && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void startTraining()}
            disabled={training}
          >
            {training ? "Starting…" : "Start LoRA training"}
          </button>
        )}
      </div>
    </div>
  );
}
