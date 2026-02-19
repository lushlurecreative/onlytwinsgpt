"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function AdminHomeClient() {
  const [handles, setHandles] = useState("");
  const [handlesSaving, setHandlesSaving] = useState(false);
  const [handlesMessage, setHandlesMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/app-settings")
      .then((r) => r.json())
      .then((data: Record<string, string>) => setHandles(data.lead_scrape_handles ?? ""))
      .catch(() => {});
  }, []);

  async function saveHandles() {
    setHandlesSaving(true);
    setHandlesMessage("");
    try {
      const res = await fetch("/api/admin/app-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_scrape_handles: handles.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setHandlesMessage(data.ok ? "Saved." : data.error ?? "Save failed.");
    } finally {
      setHandlesSaving(false);
    }
  }

  async function runPipeline() {
    setLoading(true);
    setMessage("");
    try {
      const scrapeRes = await fetch("/api/admin/automation/run-daily-scrape", { method: "POST" });
      const scrapeData = (await scrapeRes.json().catch(() => ({}))) as { ok?: boolean; imported?: number; error?: string };
      const enqueueRes = await fetch("/api/admin/automation/run-enqueue-samples", { method: "POST" });
      const enqueueData = (await enqueueRes.json().catch(() => ({}))) as { ok?: boolean; enqueued?: number; error?: string };

      if (scrapeData.ok && enqueueData.ok) {
        setMessage(`Done. Imported ${scrapeData.imported ?? 0} leads. Queued ${enqueueData.enqueued ?? 0} for sample generation.`);
      } else {
        setMessage(scrapeData.error || enqueueData.error || "Something went wrong.");
      }
    } catch {
      setMessage("Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ maxWidth: 560 }}>
      <h2 style={{ marginTop: 0 }}>Generate content</h2>
      <p className="muted" style={{ marginBottom: 24 }}>
        Run the pipeline: fetch leads from Instagram, then queue them for sample generation.
      </p>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", marginBottom: 6, fontSize: 14 }}>
          Instagram handles (comma-separated)
        </label>
        <textarea
          className="input"
          rows={2}
          value={handles}
          onChange={(e) => setHandles(e.target.value)}
          placeholder="user1,user2,user3"
          style={{ width: "100%", maxWidth: 400 }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void saveHandles()}
          disabled={handlesSaving}
          style={{ marginTop: 8 }}
        >
          {handlesSaving ? "Saving…" : "Save"}
        </button>
        {handlesMessage ? <span style={{ marginLeft: 8, fontSize: 13 }}>{handlesMessage}</span> : null}
      </div>

      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void runPipeline()}
        disabled={loading}
        style={{ padding: "14px 28px", fontSize: 16 }}
      >
        {loading ? "Running…" : "Run pipeline"}
      </button>

      {message ? (
        <p style={{ marginTop: 16, marginBottom: 0 }}>{message}</p>
      ) : null}

      <p style={{ marginTop: 32 }}>
        <Link href="/admin/leads">View leads</Link>
      </p>
    </section>
  );
}
