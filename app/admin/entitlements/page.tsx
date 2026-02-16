"use client";

import { useState } from "react";

type EntitlementResult = {
  creatorId: string;
  viewerId: string | null;
  matrix: {
    ownerHasSubscriberAccess: boolean;
    anonymousVisibleCount: number;
    viewerHasSubscription: boolean;
    viewerVisibleCount: number;
    expectedSubscriberOnlyLockedForAnonymous: number;
  };
};

export default function AdminEntitlementsPage() {
  const [creatorId, setCreatorId] = useState("");
  const [viewerId, setViewerId] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<EntitlementResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runCheck() {
    setLoading(true);
    setError("");
    setResult(null);
    const query = new URLSearchParams();
    query.set("creatorId", creatorId);
    if (viewerId.trim()) query.set("viewerId", viewerId.trim());
    const response = await fetch(`/api/admin/entitlements?${query.toString()}`);
    const json = (await response.json().catch(() => ({}))) as EntitlementResult & { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to run entitlement check");
      setLoading(false);
      return;
    }
    setResult(json);
    setLoading(false);
  }

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Entitlement Regression Check</h2>
      <p>Validate expected visibility behavior for public, owner, and subscriber scenarios.</p>
      <div style={{ display: "grid", gap: 8, maxWidth: 640 }}>
        <label>
          Creator ID
          <input
            value={creatorId}
            onChange={(e) => setCreatorId(e.target.value)}
            placeholder="creator uuid"
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <label>
          Viewer ID (optional)
          <input
            value={viewerId}
            onChange={(e) => setViewerId(e.target.value)}
            placeholder="subscriber uuid"
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <button
          onClick={runCheck}
          disabled={!creatorId.trim() || loading}
          style={{ width: "fit-content", padding: "8px 12px" }}
        >
          {loading ? "Running..." : "Run Check"}
        </button>
      </div>
      {error ? <p style={{ color: "red" }}>❌ {error}</p> : null}
      {result ? (
        <pre
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid #333",
            borderRadius: 8,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

