"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PostRow = {
  id: string;
  storage_path: string;
  caption: string | null;
  is_published: boolean;
  created_at: string;
  signed_url: string | null;
};

export default function MePage() {
  const [status, setStatus] = useState("Loading...");
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [postsError, setPostsError] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) return setStatus(`❌ ${error.message}`);
      if (!data.user) {
        setStatus("❌ Not signed in.");
        return;
      }

      setStatus(`✅ Signed in as: ${data.user.email}`);

      const response = await fetch("/api/posts");
      const result = (await response.json().catch(() => ({}))) as {
        posts?: PostRow[];
        error?: string;
      };

      if (!response.ok) {
        setPostsError(result.error ?? "Failed to load posts");
        return;
      }

      setPosts(result.posts ?? []);
    })();
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Me</h1>
      <p>{status}</p>
      <h2 style={{ marginTop: 18 }}>My Posts</h2>
      {postsError ? <p>❌ {postsError}</p> : null}
      {!postsError && posts.length === 0 ? <p>No posts yet.</p> : null}
      {!postsError && posts.length > 0 ? (
        <ul>
          {posts.map((post) => (
            <li key={post.id}>
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
                // Minimal preview for image uploads.
                <img
                  src={post.signed_url}
                  alt={post.caption ?? "Uploaded content"}
                  style={{ marginTop: 8, maxWidth: 280, display: "block" }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p style={{ marginTop: 12 }}>
        Go to <code>/login</code>
      </p>
    </main>
  );
}
