"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function AdminSettingsClient() {
  const [handles, setHandles] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [dbLoading, setDbLoading] = useState(false);
  const [dbMsg, setDbMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/app-settings")
      .then((r) => r.json())
      .then((data: Record<string, string>) => setHandles(data.lead_scrape_handles ?? ""))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveHandles() {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/admin/app-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_scrape_handles: handles.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setSaveMsg(data.ok ? "Saved." : data.error ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function updateDatabase() {
    setDbLoading(true);
    setDbMsg("");
    try {
      const res = await fetch("/api/admin/run-migrations", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setDbMsg(data.ok ? "Done." : data.error ?? "Failed.");
    } finally {
      setDbLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20, marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Instagram handles</h3>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Comma-separated usernames for the pipeline.
      </p>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <textarea
            className="input"
            rows={2}
            value={handles}
            onChange={(e) => setHandles(e.target.value)}
            placeholder="user1,user2"
            style={{ width: "100%", maxWidth: 400 }}
          />
          <button type="button" className="btn btn-primary" onClick={() => void saveHandles()} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? "Saving…" : "Save"}
          </button>
          {saveMsg ? <span style={{ marginLeft: 8, fontSize: 13 }}>{saveMsg}</span> : null}
        </>
      )}

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border, #333)" }}>
        <h3 style={{ marginTop: 0 }}>Database</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          If the handles box won’t load or save, click once.
        </p>
        <button type="button" className="btn btn-ghost" onClick={() => void updateDatabase()} disabled={dbLoading}>
          {dbLoading ? "Updating…" : "Update database"}
        </button>
        {dbMsg ? <span style={{ marginLeft: 8, fontSize: 13 }}>{dbMsg}</span> : null}
      </div>

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border, #333)" }}>
        <h3 style={{ marginTop: 0 }}>RunPod</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Required for generating samples. Set your API key and endpoint so jobs can run.
        </p>
        <Link href="/admin/worker" className="btn btn-ghost">Open RunPod settings</Link>
      </div>
    </div>
  );
}
