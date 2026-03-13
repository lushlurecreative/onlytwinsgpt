"use client";

import { useState } from "react";

export default function AdminUserResetClient() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [deletingSingle, setDeletingSingle] = useState(false);
  const [singleConfirmOpen, setSingleConfirmOpen] = useState(false);
  const [singleTargetEmail, setSingleTargetEmail] = useState("");
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);

  async function deleteSingleUser() {
    if (!singleTargetEmail.trim()) return;
    setDeletingSingle(true);
    setMessage("Deleting user…");
    const res = await fetch("/api/admin/user-reset/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: singleTargetEmail.trim().toLowerCase() }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setDeletingSingle(false);
    setSingleConfirmOpen(false);
    setSingleTargetEmail("");
    if (!res.ok) {
      setMessage(json.error ?? "Delete failed");
      return;
    }
    setMessage("User deleted.");
  }

  async function deleteAllTestUsers() {
    if (deleteAllConfirmText.trim() !== "DELETE ALL TEST USERS") return;
    setDeletingAll(true);
    setMessage("Deleting all test users…");
    const res = await fetch("/api/admin/user-reset/delete-all-test-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmText: deleteAllConfirmText.trim() }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      deletedCount?: number;
      errors?: string[];
    };
    setDeletingAll(false);
    setDeleteAllConfirmOpen(false);
    setDeleteAllConfirmText("");
    if (!res.ok) {
      setMessage(json.error ?? "Delete all failed");
      return;
    }
    setMessage(`Deleted ${json.deletedCount ?? 0} users.${(json.errors ?? []).length > 0 ? ` Errors: ${json.errors!.join("; ")}` : ""}`);
  }

  return (
    <section>
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>A. Delete single user by email</h2>
        <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
          Find and permanently delete one user and all their data.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="input"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              if (email.trim()) {
                setSingleTargetEmail(email.trim().toLowerCase());
                setSingleConfirmOpen(true);
              } else {
                setMessage("Enter an email.");
              }
            }}
          >
            Find and delete user
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24, borderColor: "var(--error, #e5534b)" }}>
        <h2 style={{ marginTop: 0, marginBottom: 8, color: "var(--error, #e5534b)" }}>
          B. Delete all test users
        </h2>
        <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
          Removes every non-admin user and their data. Admin account is never deleted. Requires explicit confirmation.
        </p>
        <button
          className="btn btn-primary"
          type="button"
          style={{ background: "var(--error, #e5534b)", borderColor: "var(--error, #e5534b)" }}
          onClick={() => setDeleteAllConfirmOpen(true)}
        >
          Delete all test users
        </button>
      </div>

      {message ? <p>{message}</p> : null}

      {singleConfirmOpen ? (
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
            if (e.target === e.currentTarget && !deletingSingle) setSingleConfirmOpen(false);
          }}
        >
          <div className="card" style={{ maxWidth: 420, margin: 16, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Delete user completely</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              This permanently removes the user and all their data (auth, profile, subscriptions, subjects, generation requests, posts, etc.).
            </p>
            <p style={{ marginTop: 0 }}>
              <strong>{singleTargetEmail}</strong>
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={deletingSingle}
                onClick={() => setSingleConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                style={{ background: "var(--error, #e5534b)", borderColor: "var(--error, #e5534b)" }}
                disabled={deletingSingle}
                onClick={() => void deleteSingleUser()}
              >
                {deletingSingle ? "Deleting…" : "Delete user"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteAllConfirmOpen ? (
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
            if (e.target === e.currentTarget && !deletingAll) setDeleteAllConfirmOpen(false);
          }}
        >
          <div className="card" style={{ maxWidth: 480, margin: 16, padding: 16 }}>
            <h3 style={{ marginTop: 0, color: "var(--error, #e5534b)" }}>Delete all test users</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              This will permanently remove every non-admin user and all their data. The admin account (lush.lure.creative@gmail.com) will not be deleted.
            </p>
            <label style={{ display: "block", marginTop: 12 }}>
              <span className="muted">Type exactly: DELETE ALL TEST USERS</span>
              <input
                className="input"
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                placeholder="DELETE ALL TEST USERS"
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={deletingAll}
                onClick={() => setDeleteAllConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                style={{ background: "var(--error, #e5534b)", borderColor: "var(--error, #e5534b)" }}
                disabled={deletingAll || deleteAllConfirmText.trim() !== "DELETE ALL TEST USERS"}
                onClick={() => void deleteAllTestUsers()}
              >
                {deletingAll ? "Deleting…" : "Delete all test users"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
