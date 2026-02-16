"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";

type AdminPost = {
  id: string;
  creator_id: string;
  caption: string | null;
  is_published: boolean;
  visibility: "public" | "subscribers";
  created_at: string;
};

export default function AdminPostsPage() {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/posts");
    const result = (await response.json().catch(() => ({}))) as {
      posts?: AdminPost[];
      error?: string;
    };
    if (!response.ok) {
      setError(result.error ?? "Failed to load posts");
      setLoading(false);
      return;
    }
    setPosts(result.posts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function patchPost(postId: string, body: Record<string, unknown>) {
    setBusy((prev) => ({ ...prev, [postId]: true }));
    setError("");
    const response = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-override": "1" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Failed to update post");
      setBusy((prev) => ({ ...prev, [postId]: false }));
      return;
    }
    await load();
    setBusy((prev) => ({ ...prev, [postId]: false }));
  }

  async function deletePost(postId: string) {
    const confirmed = window.confirm("Delete this post and underlying file?");
    if (!confirmed) return;
    setBusy((prev) => ({ ...prev, [postId]: true }));
    setError("");
    const response = await fetch(`/api/posts/${postId}`, {
      method: "DELETE",
      headers: { "x-admin-override": "1" },
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Failed to delete post");
      setBusy((prev) => ({ ...prev, [postId]: false }));
      return;
    }
    await load();
    setBusy((prev) => ({ ...prev, [postId]: false }));
  }

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Post Moderation</h2>
      {loading ? <p>Loading...</p> : null}
      {error ? <p>❌ {error}</p> : null}
      {!loading && posts.length === 0 ? <p>No posts found.</p> : null}
      {!loading && posts.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 980, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Caption</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>State</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Visibility</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Created</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    <code>{post.creator_id}</code>
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {post.caption ?? "(no caption)"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {post.is_published ? "Published" : "Draft"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{post.visibility}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {new Date(post.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    <button
                      onClick={() => patchPost(post.id, { isPublished: !post.is_published })}
                      disabled={!!busy[post.id]}
                      style={{ marginRight: 6 }}
                    >
                      {post.is_published ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      onClick={() =>
                        patchPost(post.id, {
                          visibility: post.visibility === "public" ? "subscribers" : "public",
                        })
                      }
                      disabled={!!busy[post.id]}
                      style={{ marginRight: 6 }}
                    >
                      {post.visibility === "public" ? "Set subscribers" : "Set public"}
                    </button>
                    <button onClick={() => deletePost(post.id)} disabled={!!busy[post.id]}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

