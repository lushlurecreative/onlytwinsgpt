"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Subject = {
  id: string;
  user_id: string;
  label: string | null;
  consent_status: "pending" | "approved" | "revoked";
  consent_signed_at: string | null;
  identity_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type SubjectsClientProps = { userId: string };

export default function SubjectsClient({ userId }: SubjectsClientProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [createLabel, setCreateLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [trainingJobId, setTrainingJobId] = useState<string | null>(null);
  const [trainingError, setTrainingError] = useState("");
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [postCount, setPostCount] = useState<number | null>(null);

  async function loadSubjects() {
    setLoading(true);
    try {
      const r = await fetch("/api/subjects");
      const data = await r.json();
      if (r.ok) setSubjects(data.subjects ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function loadPostCount() {
    try {
      const r = await fetch("/api/posts");
      const data = await r.json();
      if (r.ok && Array.isArray(data.posts)) setPostCount(data.posts.length);
    } catch {
      setPostCount(null);
    }
  }

  useEffect(() => {
    loadSubjects();
    loadPostCount();
  }, []);

  async function createSubject(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const r = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: createLabel || null }),
      });
      const data = await r.json();
      if (!r.ok) {
        setCreateError(data.error ?? "Failed to create");
        return;
      }
      setCreateLabel("");
      await loadSubjects();
    } finally {
      setCreating(false);
    }
  }

  async function startTraining() {
    setTrainingLoading(true);
    setTrainingError("");
    setTrainingJobId(null);
    try {
      const r = await fetch("/api/training", { method: "POST" });
      const data = await r.json();
      if (!r.ok) {
        setTrainingError(data.error ?? "Failed to start training");
        return;
      }
      setTrainingJobId(data.job?.id ?? null);
      await loadSubjects();
    } finally {
      setTrainingLoading(false);
    }
  }

  const approvedSubject = subjects.find((s) => s.consent_status === "approved");
  const canTrain = approvedSubject && (postCount ?? 0) >= 30 && (postCount ?? 0) <= 60;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 8 }}>Subjects</h2>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {subjects.length === 0 ? (
              <li style={{ color: "#666" }}>No subjects yet. Create one below.</li>
            ) : (
              subjects.map((s) => (
                <li key={s.id} style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
                  <strong>{s.label || "Unnamed"}</strong> — consent: <code>{s.consent_status}</code>
                  {s.consent_signed_at && ` (signed ${new Date(s.consent_signed_at).toLocaleDateString()})`}
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <form onSubmit={createSubject} style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Create subject</h3>
        <input
          type="text"
          placeholder="Label (optional)"
          value={createLabel}
          onChange={(e) => setCreateLabel(e.target.value)}
          style={{ marginRight: 8, padding: 8 }}
        />
        <button type="submit" disabled={creating}>
          {creating ? "Creating…" : "Create"}
        </button>
        {createError && <p style={{ color: "red", marginTop: 8 }}>{createError}</p>}
      </form>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Training</h3>
        <p style={{ color: "#666", marginBottom: 8 }}>
          Photos in vault: <strong>{postCount ?? "—"}</strong>. You need 30–60 photos and an approved subject to start training.
        </p>
        <button
          type="button"
          onClick={startTraining}
          disabled={trainingLoading || !canTrain}
        >
          {trainingLoading ? "Starting…" : "Start training"}
        </button>
        {!approvedSubject && subjects.length > 0 && (
          <p style={{ color: "#666", marginTop: 8 }}>Get consent approved for a subject (admin) to enable training.</p>
        )}
        {trainingError && <p style={{ color: "red", marginTop: 8 }}>{trainingError}</p>}
        {trainingJobId && <p style={{ color: "green", marginTop: 8 }}>Training job created. The RunPod worker will process it.</p>}
      </div>

      <p>
        <Link href="/vault">Back to Vault</Link>
      </p>
    </div>
  );
}
