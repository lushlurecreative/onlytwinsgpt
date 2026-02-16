"use client";

import { useEffect, useState } from "react";

type CreatorFeedPost = {
  id: string;
  storage_path: string;
  caption: string | null;
  visibility: "public" | "subscribers";
  created_at: string;
  signed_url: string | null;
};

type CreatorFeedResponse = {
  posts?: CreatorFeedPost[];
  subscriberAccess?: boolean;
  viewerMode?: "normal" | "public";
  lockedSubscriberPostCount?: number;
  lockedTeasers?: { id: string; caption: string | null; created_at: string }[];
  error?: string;
};

export default function CreatorFeedPage({
  params,
}: {
  params: Promise<{ creatorId: string }>;
}) {
  const [creatorId, setCreatorId] = useState("");
  const [status, setStatus] = useState("Loading...");
  const [subscriberAccess, setSubscriberAccess] = useState(false);
  const [viewerMode, setViewerMode] = useState<"normal" | "public">("normal");
  const [posts, setPosts] = useState<CreatorFeedPost[]>([]);
  const [lockedSubscriberPostCount, setLockedSubscriberPostCount] = useState(0);
  const [lockedTeasers, setLockedTeasers] = useState<
    { id: string; caption: string | null; created_at: string }[]
  >([]);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [planId, setPlanId] = useState<"monthly" | "supporter">("monthly");

  useEffect(() => {
    async function load() {
      const resolved = await params;
      setCreatorId(resolved.creatorId);
      setStatus("Loading...");

      const suffix = viewerMode === "public" ? "?mode=public" : "";
      const response = await fetch(`/api/feed/creator/${resolved.creatorId}${suffix}`);
      const result = (await response.json().catch(() => ({}))) as CreatorFeedResponse;

      if (!response.ok) {
        setStatus(`❌ ${result.error ?? "Failed to load creator feed"}`);
        return;
      }

      setSubscriberAccess(!!result.subscriberAccess);
      setViewerMode(result.viewerMode ?? viewerMode);
      setPosts(result.posts ?? []);
      setLockedSubscriberPostCount(result.lockedSubscriberPostCount ?? 0);
      setLockedTeasers(result.lockedTeasers ?? []);
      setStatus("✅ Creator feed loaded");
    }
    void load();
  }, [params, viewerMode]);

  async function handleSubscribe() {
    if (!creatorId) return;
    setCheckoutLoading(true);
    setCheckoutError("");

    const appUrl =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const successUrl = `${appUrl}/feed/creator/${creatorId}?checkout=success`;
    const cancelUrl = `${appUrl}/feed/creator/${creatorId}?checkout=cancelled`;

    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorId, successUrl, cancelUrl }),
    });

    const result = (await response.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };

    if (!response.ok || !result.url) {
      setCheckoutLoading(false);
      setCheckoutError(result.error ?? "Failed to start checkout");
      return;
    }

    window.location.href = result.url;
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Creator Feed</h1>
      <p>Creator ID: <code>{creatorId}</code></p>
      <p>{status}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={() => setViewerMode("normal")}
          disabled={viewerMode === "normal"}
          style={{ padding: "6px 10px" }}
        >
          Normal view
        </button>
        <button
          onClick={() => setViewerMode("public")}
          disabled={viewerMode === "public"}
          style={{ padding: "6px 10px" }}
        >
          Simulate public viewer
        </button>
      </div>
      <p>Viewer mode: <strong>{viewerMode}</strong></p>
      <p>Subscriber access: <strong>{subscriberAccess ? "Yes" : "No"}</strong></p>
      <p>Total posts returned: <strong>{posts.length}</strong></p>
      {!subscriberAccess && lockedSubscriberPostCount > 0 ? (
        <p style={{ marginTop: 6 }}>
          🔒 {lockedSubscriberPostCount} subscriber-only post
          {lockedSubscriberPostCount === 1 ? "" : "s"} hidden.
        </p>
      ) : null}
      {!subscriberAccess && viewerMode === "normal" ? (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              marginBottom: 10,
              padding: 12,
              border: "1px solid #333",
              borderRadius: 8,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <p style={{ margin: 0 }}>
              Unlock full access to this creator&apos;s private subscriber content.
            </p>
            <p style={{ margin: "6px 0 0 0", opacity: 0.85 }}>
              Includes subscriber-only drops and future premium updates.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <button
              onClick={() => setPlanId("monthly")}
              disabled={checkoutLoading}
              style={{
                textAlign: "left",
                border: "1px solid #333",
                borderRadius: 8,
                padding: 10,
                background: planId === "monthly" ? "rgba(255,255,255,0.08)" : "transparent",
              }}
            >
              <div style={{ fontWeight: 700 }}>Monthly Access</div>
              <div style={{ opacity: 0.85 }}>$9.99 / month</div>
              <div style={{ opacity: 0.7, marginTop: 4 }}>Full private feed access.</div>
            </button>
            <button
              onClick={() => setPlanId("supporter")}
              disabled={checkoutLoading}
              style={{
                textAlign: "left",
                border: "1px solid #333",
                borderRadius: 8,
                padding: 10,
                background: planId === "supporter" ? "rgba(255,255,255,0.08)" : "transparent",
              }}
            >
              <div style={{ fontWeight: 700 }}>Supporter Tier</div>
              <div style={{ opacity: 0.85 }}>$19.99 / month</div>
              <div style={{ opacity: 0.7, marginTop: 4 }}>Priority updates + all premium posts.</div>
            </button>
          </div>
          <p style={{ marginTop: 0, opacity: 0.8 }}>
            Selected: <strong>{planId === "monthly" ? "Monthly Access" : "Supporter Tier"}</strong>
          </p>
          <button
            onClick={handleSubscribe}
            disabled={checkoutLoading}
            style={{ padding: "8px 12px" }}
          >
            {checkoutLoading ? "Opening checkout..." : "Continue to Checkout"}
          </button>
          {checkoutError ? <p style={{ color: "red", marginTop: 6 }}>❌ {checkoutError}</p> : null}
        </div>
      ) : null}

      {!subscriberAccess && lockedTeasers.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ marginBottom: 8 }}>Locked Preview</h2>
          <ul style={{ marginTop: 6 }}>
            {lockedTeasers.map((teaser) => (
              <li
                key={teaser.id}
                style={{
                  marginBottom: 10,
                  padding: "10px 12px",
                  border: "1px dashed #444",
                  borderRadius: 8,
                  opacity: 0.9,
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  🔒 Subscriber-only post
                </div>
                <div style={{ filter: "blur(1.8px)", userSelect: "none" }}>
                  {teaser.caption ?? "Premium content preview"}
                </div>
                <div style={{ marginTop: 6, opacity: 0.75 }}>
                  {new Date(teaser.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {posts.length > 0 ? (
        <ul style={{ marginTop: 14 }}>
          {posts.map((post) => (
            <li key={post.id} style={{ marginBottom: 18 }}>
              {post.caption ? <div>{post.caption}</div> : null}
              <div>
                <code>{post.storage_path}</code>
              </div>
              <div>Visibility: <strong>{post.visibility}</strong></div>
              {post.signed_url ? (
                <div style={{ marginTop: 6 }}>
                  <a href={post.signed_url} target="_blank" rel="noopener noreferrer">
                    Open signed URL
                  </a>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}

