"use client";

/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { SCENE_PRESETS, type ScenePresetKey } from "@/lib/scene-presets";

type UploadClientProps = {
  userId: string;
};

type Status = "idle" | "uploading" | "success" | "error";
type PostRow = {
  id: string;
  storage_path: string;
  caption: string | null;
  is_published: boolean;
  visibility: "public" | "subscribers";
  created_at: string;
  signed_url: string | null;
};

type GenerationRequestRow = {
  id: string;
  scene_preset: string;
  content_mode: "sfw" | "mature";
  image_count: number;
  video_count: number;
  status: "pending" | "approved" | "rejected" | "generating" | "completed" | "failed";
  progress_done: number;
  progress_total: number;
  retry_count: number;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

export default function UploadClient({ userId }: UploadClientProps) {
  void userId;
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [deletingPostIds, setDeletingPostIds] = useState<Record<string, boolean>>({});
  const [selectedSamplePaths, setSelectedSamplePaths] = useState<string[]>([]);
  const [requestScene, setRequestScene] = useState<ScenePresetKey>("beach");
  const [requestContentMode, setRequestContentMode] = useState<"sfw" | "mature">("sfw");
  const [requestImageCount, setRequestImageCount] = useState<number>(30);
  const [requestVideoCount, setRequestVideoCount] = useState<number>(0);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requests, setRequests] = useState<GenerationRequestRow[]>([]);

  async function loadPosts() {
    const response = await fetch("/api/posts");
    if (!response.ok) return;
    const result = (await response.json().catch(() => ({}))) as { posts?: PostRow[] };
    const nextPosts = result.posts ?? [];
    setPosts(nextPosts);
  }

  useEffect(() => {
    void loadPosts();
  }, []);

  async function loadRequests() {
    const response = await fetch("/api/generation-requests");
    if (!response.ok) return;
    const result = (await response.json().catch(() => ({}))) as { requests?: GenerationRequestRow[] };
    setRequests(result.requests ?? []);
  }

  useEffect(() => {
    void loadRequests();
    const id = setInterval(() => {
      void loadRequests();
    }, 8000);
    return () => clearInterval(id);
  }, []);

  async function handleUpload() {
    if (!file) return;

    setStatus("uploading");
    setErrorMessage("");
    setSuccessMessage("");

    const formData = new FormData();
    formData.append("file", file);

    const uploadResponse = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });
    const uploadResult = (await uploadResponse.json().catch(() => ({}))) as {
      objectPath?: string;
      signedUrl?: string | null;
      error?: string;
    };

    if (!uploadResponse.ok || !uploadResult.objectPath) {
      setStatus("error");
      setErrorMessage(uploadResult.error ?? "Upload failed");
      return;
    }
    const objectPath = uploadResult.objectPath;

    const postResponse = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storagePath: objectPath,
        // Samples are not meant to be public feed content.
        caption: null,
        visibility: "subscribers",
      }),
    });

    if (!postResponse.ok) {
      const postResult = (await postResponse.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setErrorMessage(postResult.error ?? "Failed to create post row");
      return;
    }

    setStatus("success");
    setSuccessMessage("Upload complete.");
    await loadPosts();
  }

  async function deletePost(post: PostRow) {
    const confirmed = window.confirm(
      "Delete this sample upload? This cannot be undone."
    );
    if (!confirmed) return;

    setDeletingPostIds((prev) => ({ ...prev, [post.id]: true }));
    setErrorMessage("");
    setSuccessMessage("");

    const response = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setErrorMessage(result.error ?? "Failed to delete post");
      setDeletingPostIds((prev) => ({ ...prev, [post.id]: false }));
      return;
    }

    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    setSuccessMessage("Post deleted.");
    setDeletingPostIds((prev) => ({ ...prev, [post.id]: false }));
  }

  async function submitGenerationRequest() {
    if (isSubmittingRequest) return;
    if (selectedSamplePaths.length !== 10) {
      setRequestMessage("Select exactly 10 sample uploads before submitting.");
      return;
    }
    setIsSubmittingRequest(true);
    setRequestMessage("");
    setErrorMessage("");
    setSuccessMessage("");

    const response = await fetch("/api/generation-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        samplePaths: selectedSamplePaths,
        scenePreset: requestScene,
        contentMode: requestContentMode,
        imageCount: requestImageCount,
        videoCount: requestVideoCount,
      }),
    });

    const result = (await response.json().catch(() => ({}))) as {
      request?: { id: string };
      error?: string;
    };

    if (!response.ok) {
      setRequestMessage(result.error ?? "Request submit failed");
      setIsSubmittingRequest(false);
      return;
    }

    setRequestMessage(`Request submitted: ${result.request?.id ?? "created"}. Waiting for admin approval.`);
    setSelectedSamplePaths([]);
    await loadRequests();
    setIsSubmittingRequest(false);
  }

  function toggleSamplePath(path: string) {
    setSelectedSamplePaths((prev) => {
      if (prev.includes(path)) return prev.filter((p) => p !== path);
      if (prev.length >= 10) return prev;
      return [...prev, path];
    });
  }

  function selectNewestTen() {
    const newestTen = [...posts]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map((p) => p.storage_path);
    setSelectedSamplePaths(newestTen);
  }

  const postsNewestFirst = [...posts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const latestRequest = requests[0];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>1) Upload samples</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Upload at least 10 images. These are private samples for approval and training.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFile(f ?? null);
            }}
            disabled={status === "uploading"}
          />
          <button className="btn btn-primary" onClick={handleUpload} disabled={!file || status === "uploading"}>
            {status === "uploading" ? "Uploading..." : "Upload"}
          </button>
          {errorMessage ? <span style={{ color: "var(--danger)" }}>{errorMessage}</span> : null}
          {successMessage ? <span style={{ color: "var(--success)" }}>{successMessage}</span> : null}
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>2) Select 10 samples</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Pick exactly 10 images for this request.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-ghost" onClick={selectNewestTen} type="button">
            Use newest 10
          </button>
          <button className="btn btn-ghost" onClick={() => setSelectedSamplePaths([])} type="button">
            Clear selection
          </button>
          <span className="badge">Selected: {selectedSamplePaths.length}/10</span>
          <span className="muted" style={{ fontSize: 12 }}>
            Uploaded: {postsNewestFirst.length}
          </span>
        </div>

        {postsNewestFirst.length === 0 ? (
          <p style={{ marginTop: 10 }} className="muted">
            No uploads yet.
          </p>
        ) : (
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            {postsNewestFirst.map((post) => {
              const checked = selectedSamplePaths.includes(post.storage_path);
              const disabled = !checked && selectedSamplePaths.length >= 10;
              return (
                <div key={post.id} className="card" style={{ padding: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSamplePath(post.storage_path)}
                        disabled={disabled}
                      />
                      Sample
                    </label>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => deletePost(post)}
                      disabled={!!deletingPostIds[post.id]}
                      style={{ padding: "6px 10px" }}
                    >
                      {deletingPostIds[post.id] ? "Deleting..." : "Delete"}
                    </button>
                  </div>

                  {post.signed_url ? (
                    <img
                      src={post.signed_url}
                      alt="Sample upload"
                      style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 10, marginTop: 8 }}
                    />
                  ) : (
                    <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                      No preview available yet.
                    </div>
                  )}

                  <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                    {new Date(post.created_at).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>3) Submit request</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          After you submit, we review your samples and then generate.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Scene
            </div>
            <select
              className="input"
              value={requestScene}
              onChange={(e) => setRequestScene(e.target.value as ScenePresetKey)}
              disabled={isSubmittingRequest}
            >
              {SCENE_PRESETS.map((scene) => (
                <option key={scene.key} value={scene.key}>
                  {scene.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Content mode
            </div>
            <select
              className="input"
              value={requestContentMode}
              onChange={(e) => setRequestContentMode(e.target.value as "sfw" | "mature")}
              disabled={isSubmittingRequest}
            >
              <option value="sfw">SFW</option>
              <option value="mature">Mature (non-explicit)</option>
            </select>
          </label>

          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Images requested
            </div>
            <input
              className="input"
              type="number"
              min={10}
              max={50}
              value={requestImageCount}
              onChange={(e) => setRequestImageCount(Number(e.target.value))}
              disabled={isSubmittingRequest}
            />
          </label>
        </div>

        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 800 }}>Advanced</summary>
          <div style={{ marginTop: 10, maxWidth: 240 }}>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Videos requested (not implemented yet)
              </div>
              <input
                className="input"
                type="number"
                min={0}
                max={20}
                value={requestVideoCount}
                onChange={(e) => setRequestVideoCount(Number(e.target.value))}
                disabled={isSubmittingRequest}
              />
            </label>
          </div>
        </details>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
          <button
            className="btn btn-primary"
            onClick={submitGenerationRequest}
            disabled={selectedSamplePaths.length !== 10 || isSubmittingRequest}
            type="button"
          >
            {isSubmittingRequest ? "Submitting..." : "Submit request"}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Selected samples must be exactly 10.
          </span>
        </div>

        {requestMessage ? (
          <p
            style={{
              marginBottom: 0,
              marginTop: 10,
              color: requestMessage.includes("failed") ? "var(--danger)" : "var(--success)",
            }}
          >
            {requestMessage}
          </p>
        ) : null}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Request status</h2>
        {!latestRequest ? (
          <p className="muted">No requests yet.</p>
        ) : (
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Last request: <code>{latestRequest.id}</code>
            </div>
            <div style={{ marginTop: 6 }}>
              Status: <span className="badge">{latestRequest.status}</span> · Progress{" "}
              {latestRequest.progress_done}/{latestRequest.progress_total} · Retries{" "}
              {latestRequest.retry_count}
            </div>
            {latestRequest.admin_notes ? (
              <div className="muted" style={{ marginTop: 8 }}>
                Admin note: {latestRequest.admin_notes}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
