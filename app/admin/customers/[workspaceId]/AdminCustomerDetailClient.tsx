"use client";

import { useState } from "react";

type Subscription = {
  status: string;
  stripe_price_id: string | null;
  current_period_end: string | null;
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

type Props = {
  workspaceId: string;
  subscription: Subscription;
  training: TrainingInfo;
  generations: GenerationRow[];
  assets: { path: string; createdAt: string; requestId?: string }[];
  failures: FailureRow[];
};

export default function AdminCustomerDetailClient({
  workspaceId,
  subscription,
  training,
  generations,
  assets,
  failures,
}: Props) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

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
      {message ? <p style={{ margin: 0, color: "var(--color-muted)" }}>{message}</p> : null}

      {/* Section A: Subscription */}
      <div>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Subscription</h3>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 500 }}>Plan</td>
              <td style={{ padding: 4 }}>{planLabel}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 500 }}>Status</td>
              <td style={{ padding: 4 }}>{statusLabel}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 500 }}>Renewal Date</td>
              <td style={{ padding: 4 }}>
                {subscription?.current_period_end
                  ? new Date(subscription.current_period_end).toLocaleDateString()
                  : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

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

      {/* Section C: Generations */}
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
