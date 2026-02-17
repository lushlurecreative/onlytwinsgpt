"use client";

import { useState, useEffect } from "react";

type ConfigState = {
  configured: boolean;
  hasApiKey: boolean;
  endpointId: string | null;
  source?: string;
  health?: { ok: boolean; jobs?: Record<string, number>; error?: string };
};

type TrainingJob = {
  id: string;
  subject_id: string;
  status: string;
  runpod_job_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type GenerationJob = {
  id: string;
  subject_id: string | null;
  preset_id: string;
  status: string;
  output_path: string | null;
  runpod_job_id: string | null;
  created_at: string;
};

export default function AdminWorkerClient() {
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [jobs, setJobs] = useState<{ training_jobs: TrainingJob[]; generation_jobs: GenerationJob[] } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [endpointId, setEndpointId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadConfig() {
    try {
      const r = await fetch("/api/admin/worker/config");
      const data = await r.json();
      if (r.ok) setConfig(data);
      else setConfig({ configured: false, hasApiKey: false, endpointId: null });
    } catch {
      setConfig({ configured: false, hasApiKey: false, endpointId: null });
    }
  }

  async function loadJobs() {
    try {
      const r = await fetch("/api/admin/worker/jobs?limit=30");
      const data = await r.json();
      if (r.ok) setJobs(data);
    } catch {
      setJobs({ training_jobs: [], generation_jobs: [] });
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadJobs()]);
      setLoading(false);
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/worker/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runpod_api_key: apiKey || undefined,
          runpod_endpoint_id: endpointId || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setMessage(data.error ?? "Save failed");
        return;
      }
      setMessage("Saved.");
      setApiKey("");
      await loadConfig();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <div style={{ marginTop: 24 }}>
      <section className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>RunPod Serverless</h2>
        {config?.configured ? (
          <p>
            <strong>Configured.</strong> Endpoint ID: <code>{config.endpointId}</code>
            {config.source && (
              <span className="muted" style={{ marginLeft: 8 }}>
                (from {config.source})
              </span>
            )}
          </p>
        ) : (
          <p className="muted">
            Not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID in Vercel env, or save them below (stored in app).
          </p>
        )}
        {config?.health && (
          <p>
            Health: {config.health.ok ? "OK" : `Error: ${config.health.error}`}
            {config.health.jobs && (
              <span className="muted" style={{ marginLeft: 8 }}>
                Jobs: {JSON.stringify(config.health.jobs)}
              </span>
            )}
          </p>
        )}
        <form onSubmit={handleSave} style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="runpod_api_key" style={{ display: "block", marginBottom: 4 }}>
              RunPod API key (optional – leave blank to keep current)
            </label>
            <input
              id="runpod_api_key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config?.hasApiKey ? "••••••••" : "Paste API key"}
              style={{ width: "100%", maxWidth: 400, padding: 8 }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="runpod_endpoint_id" style={{ display: "block", marginBottom: 4 }}>
              RunPod endpoint ID
            </label>
            <input
              id="runpod_endpoint_id"
              type="text"
              value={endpointId}
              onChange={(e) => setEndpointId(e.target.value)}
              placeholder={config?.endpointId ?? "Endpoint ID from RunPod console"}
              style={{ width: "100%", maxWidth: 400, padding: 8 }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {message && <span style={{ marginLeft: 12 }}>{message}</span>}
        </form>
        <p className="muted" style={{ marginTop: 16, fontSize: 14 }}>
          Deploy the worker image once in RunPod Serverless (Dockerfile.serverless in worker/), add SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, and HF_TOKEN to the endpoint env. Then paste the endpoint ID here. After that, all training and generation runs are triggered from this app.
        </p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Recent jobs</h2>
        <p className="muted">Training and generation jobs (dispatched to RunPod when configured).</p>
        {jobs && (
          <>
            <h3 style={{ fontSize: 16, marginTop: 16 }}>Training</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #eee" }}>
                  <th style={{ padding: 8 }}>Job ID</th>
                  <th style={{ padding: 8 }}>Subject</th>
                  <th style={{ padding: 8 }}>Status</th>
                  <th style={{ padding: 8 }}>RunPod ID</th>
                  <th style={{ padding: 8 }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.training_jobs.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 8 }}>No training jobs yet.</td></tr>
                ) : (
                  jobs.training_jobs.map((j) => (
                    <tr key={j.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 8, fontSize: 12 }}>{j.id.slice(0, 8)}…</td>
                      <td style={{ padding: 8, fontSize: 12 }}>{j.subject_id.slice(0, 8)}…</td>
                      <td style={{ padding: 8 }}><code>{j.status}</code></td>
                      <td style={{ padding: 8, fontSize: 12 }}>{j.runpod_job_id ? `${j.runpod_job_id.slice(0, 12)}…` : "—"}</td>
                      <td style={{ padding: 8, fontSize: 12 }}>{new Date(j.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <h3 style={{ fontSize: 16, marginTop: 24 }}>Generation</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #eee" }}>
                  <th style={{ padding: 8 }}>Job ID</th>
                  <th style={{ padding: 8 }}>Status</th>
                  <th style={{ padding: 8 }}>Output</th>
                  <th style={{ padding: 8 }}>RunPod ID</th>
                  <th style={{ padding: 8 }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.generation_jobs.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 8 }}>No generation jobs yet.</td></tr>
                ) : (
                  jobs.generation_jobs.map((j) => (
                    <tr key={j.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 8, fontSize: 12 }}>{j.id.slice(0, 8)}…</td>
                      <td style={{ padding: 8 }}><code>{j.status}</code></td>
                      <td style={{ padding: 8, fontSize: 12 }}>{j.output_path ? "✓" : "—"}</td>
                      <td style={{ padding: 8, fontSize: 12 }}>{j.runpod_job_id ? `${j.runpod_job_id.slice(0, 12)}…` : "—"}</td>
                      <td style={{ padding: 8, fontSize: 12 }}>{new Date(j.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
