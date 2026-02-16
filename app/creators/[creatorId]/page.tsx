"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CreatorStats = {
  creatorId: string;
  totalPosts: number;
  publicPublished: number;
  subscriberPublished: number;
  error?: string;
};

type CreatorPost = {
  id: string;
  caption: string | null;
  created_at: string;
  visibility: "public" | "subscribers";
  signed_url: string | null;
};

export default function CreatorProfilePage({
  params,
}: {
  params: Promise<{ creatorId: string }>;
}) {
  const [creatorId, setCreatorId] = useState("");
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [lockedCount, setLockedCount] = useState(0);
  const [status, setStatus] = useState("Loading creator...");

  useEffect(() => {
    async function load() {
      const { creatorId: resolvedId } = await params;
      setCreatorId(resolvedId);
      setStatus("Loading creator...");

      const [statsRes, feedRes] = await Promise.all([
        fetch(`/api/creators/${resolvedId}`),
        fetch(`/api/feed/creator/${resolvedId}?mode=public`),
      ]);

      const statsJson = (await statsRes.json().catch(() => ({}))) as CreatorStats;
      const feedJson = (await feedRes.json().catch(() => ({}))) as {
        posts?: CreatorPost[];
        lockedSubscriberPostCount?: number;
        error?: string;
      };

      if (!statsRes.ok) {
        setStatus(`❌ ${statsJson.error ?? "Failed to load creator profile"}`);
        return;
      }
      if (!feedRes.ok) {
        setStatus(`❌ ${feedJson.error ?? "Failed to load creator posts"}`);
        return;
      }

      setStats(statsJson);
      setPosts(feedJson.posts ?? []);
      setLockedCount(feedJson.lockedSubscriberPostCount ?? 0);
      setStatus("✅ Loaded");
    }
    void load();
  }, [params]);

  return (
    <main style={{ padding: 24 }}>
      <h1>Creator Profile</h1>
      <p>
        Creator: <code>{creatorId}</code>
      </p>
      <p>{status}</p>
      {stats ? (
        <p>
          Public posts: <strong>{stats.publicPublished}</strong>
          {stats.subscriberPublished > 0 ? (
            <>
              {" "}
              | Subscriber-only posts: <strong>{stats.subscriberPublished}</strong>
            </>
          ) : null}
        </p>
      ) : null}

      {lockedCount > 0 ? (
        <div
          style={{
            marginTop: 12,
            border: "1px solid #333",
            borderRadius: 8,
            padding: 12,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <p style={{ margin: 0 }}>
            🔒 {lockedCount} premium post{lockedCount === 1 ? "" : "s"} hidden.
          </p>
          <p style={{ marginTop: 8 }}>
            <Link href={`/feed/creator/${creatorId}`}>Open creator feed to subscribe</Link>
          </p>
        </div>
      ) : null}

      {posts.length > 0 ? (
        <ul style={{ marginTop: 16 }}>
          {posts.map((post) => (
            <li key={post.id} style={{ marginBottom: 16 }}>
              <div>{post.caption ?? "(no caption)"}</div>
              <div style={{ opacity: 0.8 }}>{new Date(post.created_at).toLocaleString()}</div>
              {post.signed_url ? (
                <div style={{ marginTop: 6 }}>
                  <a href={post.signed_url} target="_blank" rel="noopener noreferrer">
                    Open image
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

