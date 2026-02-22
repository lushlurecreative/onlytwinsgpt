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

type Props = { initialSubjects: SubjectRow[] };

export default function AdminSubjectsSection({ initialSubjects }: Props) {
  const [subjects, setSubjects] = useState(initialSubjects);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function updateConsent(subjectId: string, consent_status: "pending" | "approved" | "revoked") {
    setUpdatingId(subjectId);
    setError("");
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
        setError(data.error ?? "Update failed");
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

  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>Subject (Vault / consent)</h3>
      <p className="muted" style={{ marginBottom: 12 }}>
        Approve or revoke consent for this customer&apos;s subject (twin).
      </p>
      {error && <p style={{ color: "red", marginBottom: 16 }}>{error}</p>}
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
                      onClick={() => updateConsent(s.id, "approved")}
                      disabled={s.consent_status === "approved"}
                      style={{ marginRight: 8 }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => updateConsent(s.id, "revoked")}
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
      {subjects.length === 0 && <p className="muted">No subject for this customer.</p>}
    </div>
  );
}
