"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";

type FeedPost = {
  id: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
  signed_url: string | null;
};

export default function FeedPage() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [mediaOnly, setMediaOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/feed");
      const result = (await response.json().catch(() => ({}))) as {
        posts?: FeedPost[];
        error?: string;
      };

      if (!response.ok) {
        setErrorMessage(result.error ?? "Failed to load feed");
        setLoading(false);
        return;
      }

      setPosts(result.posts ?? []);
      setLoading(false);
    })();
  }, []);

  const filteredPosts = posts
    .filter((post) => {
      const text = `${post.caption ?? ""} ${post.storage_path}`.toLowerCase();
      const queryValue = query.toLowerCase().trim();
      const queryMatch = !queryValue || text.includes(queryValue);
      const mediaMatch = !mediaOnly || !!post.signed_url;
      return queryMatch && mediaMatch;
    })
    .sort((a, b) =>
      sortBy === "oldest"
        ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1>Public Feed</h1>
      <p style={{ marginTop: 0, opacity: 0.9 }}>
        Explore publicly visible creator content. Subscribe on creator pages to unlock premium drops.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search captions or paths..."
          style={{ padding: "8px 10px", minWidth: 260 }}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "newest" | "oldest")}
          style={{ padding: "8px 10px" }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 6px" }}>
          <input
            type="checkbox"
            checked={mediaOnly}
            onChange={(e) => setMediaOnly(e.target.checked)}
          />
          Media only
        </label>
      </div>
      {loading ? <p>Loading...</p> : null}
      {!loading && errorMessage ? <p>❌ {errorMessage}</p> : null}
      {!loading && !errorMessage && posts.length === 0 ? (
        <p style={{ marginTop: 10 }}>No published posts yet.</p>
      ) : null}
      {!loading && !errorMessage && posts.length > 0 ? (
        <p style={{ opacity: 0.85 }}>
          Showing <strong>{filteredPosts.length}</strong> of <strong>{posts.length}</strong> posts.
        </p>
      ) : null}
      {filteredPosts.length > 0 ? (
        <ul style={{ marginTop: 14, listStyle: "none", padding: 0 }}>
          {filteredPosts.map((post) => (
            <li
              key={post.id}
              style={{
                marginBottom: 18,
                border: "1px solid #333",
                borderRadius: 10,
                padding: 12,
              }}
            >
              {post.caption ? <div>{post.caption}</div> : null}
              <div>
                <code>{post.storage_path}</code>
              </div>
              {post.signed_url ? (
                <div style={{ marginTop: 6 }}>
                  <a href={post.signed_url} target="_blank" rel="noopener noreferrer">
                    Open signed URL
                  </a>
                </div>
              ) : null}
              {post.signed_url ? (
                <img
                  src={post.signed_url}
                  alt={post.caption ?? "Published media"}
                  style={{ marginTop: 8, maxWidth: 320, display: "block" }}
                />
              ) : null}
              <div style={{ marginTop: 8 }}>
                <Link href="/creators">Browse creators</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && !errorMessage && posts.length > 0 && filteredPosts.length === 0 ? (
        <p>No posts match your filters.</p>
      ) : null}
    </main>
  );
}

