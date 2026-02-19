"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Result = { ok?: boolean; imported?: number; enqueued?: number; sent?: number; reason?: string; error?: string };

export default function AdminAutomationPage() {
  const [scrapeResult, setScrapeResult] = useState<Result | null>(null);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [enqueueResult, setEnqueueResult] = useState<Result | null>(null);
  const [enqueueLoading, setEnqueueLoading] = useState(false);
  const [outreachResult, setOutreachResult] = useState<Result | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);

  const [leadScrapeHandles, setLeadScrapeHandles] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateMessage, setMigrateMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/app-settings")
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        setLeadScrapeHandles(data.lead_scrape_handles ?? "");
      })
      .catch(() => setLeadScrapeHandles(""))
      .finally(() => setSettingsLoading(false));
  }, []);

  async function runMigrations() {
    setMigrateLoading(true);
    setMigrateMessage("");
    try {
      const res = await fetch("/api/admin/run-migrations", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (data.ok) {
        setMigrateMessage("Database updated. You can refresh the page.");
      } else {
        setMigrateMessage(data.error ?? "Update failed. Check that DATABASE_URL is set in Vercel.");
      }
    } finally {
      setMigrateLoading(false);
    }
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsMessage("");
    try {
      const res = await fetch("/api/admin/app-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_scrape_handles: leadScrapeHandles.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (data.ok) setSettingsMessage("Saved.");
      else setSettingsMessage(data.error ?? "Save failed.");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function runScrape() {
    setScrapeLoading(true);
    setScrapeResult(null);
    try {
      const res = await fetch("/api/admin/automation/run-daily-scrape", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Result;
      setScrapeResult(data);
    } finally {
      setScrapeLoading(false);
    }
  }

  async function runEnqueue() {
    setEnqueueLoading(true);
    setEnqueueResult(null);
    try {
      const res = await fetch("/api/admin/automation/run-enqueue-samples", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Result;
      setEnqueueResult(data);
    } finally {
      setEnqueueLoading(false);
    }
  }

  async function runOutreach() {
    setOutreachLoading(true);
    setOutreachResult(null);
    try {
      const res = await fetch("/api/admin/automation/run-send-outreach", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Result;
      setOutreachResult(data);
    } finally {
      setOutreachLoading(false);
    }
  }

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Automation overrides</h2>
      <p className="muted">
        Trigger cron jobs manually. Normal schedule: daily scrape 8:00 UTC, enqueue samples 9:00, outreach 10:00.
      </p>

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Lead scrape handles</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          Instagram usernames the daily scrape will fetch (comma-separated). Example: <code>user1,user2,user3</code>
        </p>
        {settingsLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <textarea
              className="input"
              rows={3}
              value={leadScrapeHandles}
              onChange={(e) => setLeadScrapeHandles(e.target.value)}
              placeholder="handle1,handle2,handle3"
              style={{ width: "100%", maxWidth: 480 }}
            />
            <button
              className="btn btn-primary"
              onClick={() => void saveSettings()}
              disabled={settingsSaving}
              style={{ marginTop: 8 }}
            >
              {settingsSaving ? "Saving…" : "Save"}
            </button>
            {settingsMessage ? <p style={{ marginTop: 8, marginBottom: 0 }}>{settingsMessage}</p> : null}
          </>
        )}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border, #333)" }}>
          <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            If the box above won’t load or save, click below once to update the database (creates the settings rows).
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void runMigrations()}
            disabled={migrateLoading}
          >
            {migrateLoading ? "Updating…" : "Update database"}
          </button>
          {migrateMessage ? <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>{migrateMessage}</p> : null}
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Run daily lead scrape</h3>
          <p className="muted" style={{ fontSize: 13 }}>
            Fetches Instagram profiles from Apify (lead_scrape_handles in app_settings), upserts leads, qualifies (photo_count ≥ 3).
          </p>
          <button
            className="btn btn-primary"
            onClick={() => void runScrape()}
            disabled={scrapeLoading}
          >
            {scrapeLoading ? "Running…" : "Run scrape now"}
          </button>
          {scrapeResult ? (
            <p style={{ marginTop: 10, marginBottom: 0 }}>
              {scrapeResult.ok
                ? `Imported ${scrapeResult.imported ?? 0} leads.`
                : `Error: ${scrapeResult.error ?? "Unknown"}`}
            </p>
          ) : null}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Enqueue lead samples</h3>
          <p className="muted" style={{ fontSize: 13 }}>
            Queues qualified leads for sample generation (idempotent). Respects lead_sample_max_per_run and daily budget.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => void runEnqueue()}
            disabled={enqueueLoading}
          >
            {enqueueLoading ? "Running…" : "Enqueue samples now"}
          </button>
          {enqueueResult ? (
            <p style={{ marginTop: 10, marginBottom: 0 }}>
              {enqueueResult.ok
                ? `Enqueued ${enqueueResult.enqueued ?? 0}.${enqueueResult.reason ? ` (${enqueueResult.reason})` : ""}`
                : `Error: ${enqueueResult.error ?? "Unknown"}`}
            </p>
          ) : null}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Send outreach</h3>
          <p className="muted" style={{ fontSize: 13 }}>
            Sends outreach to sample_done leads (under max_attempts). Set OUTREACH_WEBHOOK_URL in Vercel to POST to Zapier/Make/n8n; payload: lead_id, handle, platform, message, sample_asset_path.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => void runOutreach()}
            disabled={outreachLoading}
          >
            {outreachLoading ? "Running…" : "Send outreach now"}
          </button>
          {outreachResult ? (
            <p style={{ marginTop: 10, marginBottom: 0 }}>
              {outreachResult.ok
                ? `Sent ${outreachResult.sent ?? 0} outreach messages.`
                : `Error: ${outreachResult.error ?? "Unknown"}`}
            </p>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Other overrides</h3>
        <ul style={{ marginBottom: 0 }}>
          <li>
            <Link href="/admin/leads">Lead Pipeline</Link> — Generate sample now (per lead), Send outreach (per lead).
          </li>
          <li>
            <Link href="/admin/worker">GPU Worker</Link> — View and retry jobs.
          </li>
          <li>
            <Link href="/admin/cost">Cost</Link> — GPU usage and lead_sample budget.
          </li>
        </ul>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Abuse & suspend</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          To suspend a user, set app_settings key <code>suspended_user_ids</code> to a comma-separated list of user UUIDs.
          Suspended users are blocked from checkout, generation requests, and vault generate-my-twin. Rate limits apply per IP and user.
        </p>
      </div>
    </section>
  );
}
