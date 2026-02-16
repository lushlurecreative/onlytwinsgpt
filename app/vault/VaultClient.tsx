"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SCENE_PRESETS, type ScenePresetKey } from "@/lib/scene-presets";

type VaultClientProps = { userId: string };

type Brief = {
  id: string;
  user_id: string;
  handle: string;
  niche: string;
  goals: string;
  signature_style: string;
  physical_constants: string;
  dream_scenes: string;
  created_at: string;
  updated_at: string;
};

type PostRow = {
  id: string;
  storage_path: string;
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
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type Entitlements = {
  planKey: string;
  planName: string;
  includedImages: number;
  includedVideos: number;
  maxScenes: number;
  minSamples: number;
  maxSamples: number;
};

type SessionSample = {
  postId: string;
  storagePath: string;
  signedUrl: string | null;
};

function sum(values: number[]) {
  return values.reduce((acc, n) => acc + n, 0);
}

function distributeCounts(keys: ScenePresetKey[], total: number) {
  const out: Record<string, number> = {};
  if (keys.length === 0) return out;
  const base = Math.floor(total / keys.length);
  const extra = total - base * keys.length;
  keys.forEach((k, idx) => {
    out[k] = base + (idx < extra ? 1 : 0);
  });
  return out as Record<ScenePresetKey, number>;
}

export default function VaultClient({ userId }: VaultClientProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Brief state
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefError, setBriefError] = useState("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [handle, setHandle] = useState("");
  const [niche, setNiche] = useState("");
  const [goals, setGoals] = useState("");
  const [signatureStyle, setSignatureStyle] = useState("");
  const [physicalConstants, setPhysicalConstants] = useState("");
  const [dreamScenes, setDreamScenes] = useState("");
  const [savingBrief, setSavingBrief] = useState(false);

  // Upload + sample selection state
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [uploadsError, setUploadsError] = useState("");
  const [uploadingCount, setUploadingCount] = useState(0);
  const [deletingPostIds, setDeletingPostIds] = useState<Record<string, boolean>>({});
  const [sessionSamples, setSessionSamples] = useState<SessionSample[]>([]);

  // Request state
  const [requests, setRequests] = useState<GenerationRequestRow[]>([]);
  const [requestContentMode, setRequestContentMode] = useState<"sfw" | "mature">("sfw");
  const [requestVideoCount, setRequestVideoCount] = useState<number>(0);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [entitlementsLoading, setEntitlementsLoading] = useState(true);
  const [entitlementsError, setEntitlementsError] = useState("");
  const [selectedScenes, setSelectedScenes] = useState<ScenePresetKey[]>(["beach"]);
  const [sceneImageCounts, setSceneImageCounts] = useState<Record<ScenePresetKey, number>>({ beach: 45 } as Record<
    ScenePresetKey,
    number
  >);

  async function loadBrief() {
    setBriefLoading(true);
    setBriefError("");
    const res = await fetch("/api/creator-brief");
    const json = (await res.json().catch(() => ({}))) as { brief?: Brief | null; error?: string };
    if (!res.ok) {
      setBriefError(json.error ?? "Failed to load brief");
      setBriefLoading(false);
      return;
    }
    const b = json.brief ?? null;
    setBrief(b);
    if (b) {
      setHandle(b.handle ?? "");
      setNiche(b.niche ?? "");
      setGoals(b.goals ?? "");
      setSignatureStyle(b.signature_style ?? "");
      setPhysicalConstants(b.physical_constants ?? "");
      setDreamScenes(b.dream_scenes ?? "");
      setStep(2);
    } else {
      setStep(1);
    }
    setBriefLoading(false);
  }

  async function saveBrief() {
    setSavingBrief(true);
    setBriefError("");
    const res = await fetch("/api/creator-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle,
        niche,
        goals,
        signatureStyle,
        physicalConstants,
        dreamScenes,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { brief?: Brief; error?: string };
    if (!res.ok) {
      setBriefError(json.error ?? "Failed to save brief");
      setSavingBrief(false);
      return;
    }
    setBrief(json.brief ?? null);
    setSavingBrief(false);
    setStep(2);
  }

  async function loadPosts() {
    setPostsLoading(true);
    const response = await fetch("/api/posts");
    const result = (await response.json().catch(() => ({}))) as { posts?: PostRow[]; error?: string };
    if (!response.ok) {
      setUploadsError(result.error ?? "Failed to load uploads");
      setPostsLoading(false);
      return;
    }
    const rows = (result.posts ?? []) as PostRow[];
    // Samples live at `<userId>/<uuid>-file.ext>`. Generated content lives at `<userId>/generated/...`
    const sampleOnly = rows.filter((p) => !p.storage_path.includes("/generated/"));
    setPosts(sampleOnly);
    setPostsLoading(false);
  }

  async function loadEntitlements() {
    setEntitlementsLoading(true);
    setEntitlementsError("");
    const res = await fetch("/api/me/entitlements");
    const json = (await res.json().catch(() => ({}))) as {
      entitlements?: Entitlements | null;
      error?: string;
    };
    if (!res.ok) {
      setEntitlementsError(json.error ?? "Failed to load plan entitlements");
      setEntitlements(null);
      setEntitlementsLoading(false);
      return;
    }
    const e = json.entitlements ?? null;
    setEntitlements(e);
    if (!e) {
      setEntitlementsError(
        json.error ??
          "No active plan found yet. If you just purchased, wait 1-2 minutes then refresh."
      );
      setEntitlementsLoading(false);
      return;
    }

    // Initialize a sane default split whenever entitlements load.
    setSelectedScenes((prev) => {
      const initial = prev.length ? prev.slice(0, e.maxScenes) : (["beach"] as ScenePresetKey[]);
      setSceneImageCounts(distributeCounts(initial, e.includedImages));
      return initial;
    });
    setEntitlementsLoading(false);
  }

  async function loadRequests() {
    const response = await fetch("/api/generation-requests");
    const result = (await response.json().catch(() => ({}))) as { requests?: GenerationRequestRow[] };
    if (!response.ok) return;
    setRequests(result.requests ?? []);
  }

  useEffect(() => {
    void loadBrief();
    void loadPosts();
    void loadRequests();
    void loadEntitlements();
    const id = window.setInterval(() => void loadRequests(), 8000);
    return () => window.clearInterval(id);
  }, []);

  const postsNewestFirst = useMemo(() => {
    return [...posts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [posts]);

  const minSamples = entitlements?.minSamples ?? 10;
  const maxSamples = entitlements?.maxSamples ?? 20;
  const includedImages = entitlements?.includedImages ?? 45;
  const maxScenes = entitlements?.maxScenes ?? 3;

  const sampleSet = useMemo(() => {
    // Prefer the current session upload set; fallback to newest uploads for resilience.
    if (sessionSamples.length > 0) return sessionSamples.map((s) => s.storagePath);
    return postsNewestFirst.slice(0, maxSamples).map((p) => p.storage_path);
  }, [postsNewestFirst, sessionSamples, maxSamples]);

  const sampleCountOk = sampleSet.length >= minSamples && sampleSet.length <= maxSamples;
  const selectedTotalImages = useMemo(() => {
    const values = selectedScenes.map((k) => sceneImageCounts[k] ?? 0);
    return sum(values);
  }, [selectedScenes, sceneImageCounts]);

  const imageSplitOk = selectedScenes.length > 0 && selectedTotalImages === includedImages;

  function toggleScene(key: ScenePresetKey) {
    setRequestMessage("");
    setSelectedScenes((prev) => {
      const exists = prev.includes(key);
      if (!exists && prev.length >= maxScenes) {
        setRequestMessage(`Your plan allows up to ${maxScenes} scenes.`);
        return prev;
      }
      const next = exists ? prev.filter((k) => k !== key) : [...prev, key];
      setSceneImageCounts(distributeCounts(next, includedImages));
      return next;
    });
  }

  function setSceneCount(key: ScenePresetKey, raw: number) {
    if (!entitlements) return;
    const nextVal = Math.max(1, Math.floor(Number.isFinite(raw) ? raw : 1));
    setSceneImageCounts((prev) => {
      const current = prev[key] ?? 0;
      const draft = { ...prev, [key]: nextVal } as Record<ScenePresetKey, number>;
      if (selectedScenes.length <= 1) {
        draft[key] = includedImages;
        return draft;
      }

      // Keep total exactly equal to includedImages by adjusting another scene.
      const delta = nextVal - current;
      const adjustKey = selectedScenes.find((k) => k !== key) ?? key;
      draft[adjustKey] = Math.max(1, (draft[adjustKey] ?? 1) - delta);

      const total = sum(selectedScenes.map((k) => draft[k] ?? 0));
      if (total !== includedImages) {
        // If clamping prevented the exact sum, fall back to an even distribution.
        return distributeCounts(selectedScenes, includedImages);
      }
      return draft;
    });
  }

  async function deletePost(post: PostRow) {
    const confirmed = window.confirm("Delete this sample upload? This cannot be undone.");
    if (!confirmed) return;
    setDeletingPostIds((prev) => ({ ...prev, [post.id]: true }));
    const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    if (!res.ok) {
      setUploadsError("Failed to delete sample");
    } else {
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      setSessionSamples((prev) => prev.filter((s) => s.postId !== post.id));
    }
    setDeletingPostIds((prev) => ({ ...prev, [post.id]: false }));
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setUploadsError("");
    const list = Array.from(files);
    if (list.length < minSamples || list.length > maxSamples) {
      setUploadsError(`Please select between ${minSamples} and ${maxSamples} photos in one upload.`);
      return;
    }
    setUploadingCount(list.length);
    setSessionSamples([]);

    for (const f of list) {
      try {
        const formData = new FormData();
        formData.append("file", f);

        const uploadResponse = await fetch("/api/uploads", { method: "POST", body: formData });
        const uploadResult = (await uploadResponse.json().catch(() => ({}))) as {
          objectPath?: string;
          signedUrl?: string | null;
          error?: string;
        };

        if (!uploadResponse.ok || !uploadResult.objectPath) {
          throw new Error(uploadResult.error ?? "Upload failed");
        }

        const postResponse = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath: uploadResult.objectPath,
            caption: null,
            visibility: "subscribers",
          }),
        });
        if (!postResponse.ok) {
          throw new Error("Failed to register sample");
        }

        const postResult = (await postResponse.json().catch(() => ({}))) as {
          postId?: string;
          storagePath?: string;
        };
        const postId = postResult.postId;
        const storagePath = postResult.storagePath;
        if (postId && storagePath) {
          setSessionSamples((prev) => [
            ...prev,
            { postId, storagePath, signedUrl: uploadResult.signedUrl ?? null },
          ]);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setUploadsError(message);
      }
    }

    setUploadingCount(0);
    await loadPosts();
  }

  async function submitGenerationRequest() {
    if (isSubmittingRequest) return;
    if (!entitlements) {
      setRequestMessage("No active plan found yet. Please refresh in a minute if you just purchased.");
      return;
    }
    if (!sampleCountOk) {
      setRequestMessage(`Upload ${minSamples}-${maxSamples} photos to submit.`);
      return;
    }
    if (!imageSplitOk) {
      setRequestMessage(`Your scene image totals must equal ${includedImages}.`);
      return;
    }
    setIsSubmittingRequest(true);
    setRequestMessage("");

    try {
      for (const scene of selectedScenes) {
        const count = sceneImageCounts[scene] ?? 0;
        if (count <= 0) continue;

        const response = await fetch("/api/generation-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            samplePaths: sampleSet,
            scenePreset: scene,
            contentMode: requestContentMode,
            imageCount: count,
            videoCount: clamp(requestVideoCount, 0, 20),
          }),
        });

        const result = (await response.json().catch(() => ({}))) as { request?: { id: string }; error?: string };
        if (!response.ok) {
          throw new Error(result.error ?? "Request submit failed");
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setRequestMessage(message);
      setIsSubmittingRequest(false);
      return;
    }

    setRequestMessage("Submitted. Our team will review your samples next.");
    await loadRequests();
    setIsSubmittingRequest(false);
    setStep(3);
  }

  const latestRequest = requests[0];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section className="card">
        <div className="stepper">
          <div className={`step ${step === 1 ? "step-active" : step > 1 ? "step-done" : ""}`}>
            <div className="step-dot">1</div>
            <div className="step-label">Creative brief</div>
          </div>
          <div className={`step ${step === 2 ? "step-active" : step > 2 ? "step-done" : ""}`}>
            <div className="step-dot">2</div>
            <div className="step-label">Training photos</div>
          </div>
          <div className={`step ${step === 3 ? "step-active" : ""}`}>
            <div className="step-dot">3</div>
            <div className="step-label">Confirmation</div>
          </div>
        </div>
      </section>

      {step === 1 ? (
        <section className="card">
          <h1 style={{ marginTop: 0 }}>Tell us about your content</h1>
          <p className="muted">
            This brief helps us build a consistent “digital twin” and generate content that matches your look.
          </p>

          {briefLoading ? <p className="muted">Loading…</p> : null}
          {briefError ? <p style={{ color: "var(--danger)" }}>{briefError}</p> : null}

          <div className="split" style={{ gap: 12, alignItems: "start" }}>
            <div>
              <label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Creator handle / identifier
                </div>
                <input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} />
              </label>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Works with Instagram, TikTok, email, etc.
              </div>

              <label style={{ display: "block", marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Primary niche
                </div>
                <select className="input" value={niche} onChange={(e) => setNiche(e.target.value)}>
                  <option value="">Select your niche</option>
                  <option value="creator">Creator</option>
                  <option value="fitness">Fitness</option>
                  <option value="lifestyle">Lifestyle</option>
                  <option value="cosplay">Cosplay</option>
                  <option value="glamour">Glamour</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label style={{ display: "block", marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  AI-Twin goals
                </div>
                <textarea
                  className="input"
                  rows={4}
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  placeholder="Describe what you want the content to achieve…"
                />
              </label>
            </div>

            <div>
              <label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Signature style
                </div>
                <select
                  className="input"
                  value={signatureStyle}
                  onChange={(e) => setSignatureStyle(e.target.value)}
                >
                  <option value="">Choose your vibe</option>
                  <option value="soft_glam">Soft glam</option>
                  <option value="high_glam">High glam</option>
                  <option value="girl_next_door">Girl-next-door</option>
                  <option value="luxury">Luxury</option>
                  <option value="fitness_editorial">Fitness editorial</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label style={{ display: "block", marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Physical constants
                </div>
                <input
                  className="input"
                  value={physicalConstants}
                  onChange={(e) => setPhysicalConstants(e.target.value)}
                  placeholder="Always blonde hair, no tattoos, brown eyes…"
                />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Features your AI twin must always maintain.
                </div>
              </label>

              <label style={{ display: "block", marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Dream scenes
                </div>
                <textarea
                  className="input"
                  rows={4}
                  value={dreamScenes}
                  onChange={(e) => setDreamScenes(e.target.value)}
                  placeholder="3 locations you want to see in content…"
                />
              </label>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => void saveBrief()} disabled={savingBrief}>
              {savingBrief ? "Saving…" : "Continue to Training Photos"}
            </button>
            <Link className="btn btn-ghost" href="/">
              Back to Home
            </Link>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <>
          <section className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <h1 style={{ marginTop: 0, marginBottom: 6 }}>Upload training photos</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                  Quality in = quality out. Upload clear photos with variety.
                </p>
              </div>
              <button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>
                Edit brief
              </button>
            </div>

            <div className="split" style={{ gap: 12, alignItems: "stretch" }}>
              <div className="callout callout-good">
                <div className="callout-title">The gold standard</div>
                <ul className="callout-list">
                  <li>5 close-up headshots</li>
                  <li>5 waist-up mid-shots</li>
                  <li>Clear, natural lighting</li>
                  <li>Variety of outfits and backgrounds</li>
                </ul>
              </div>
              <div className="callout callout-bad">
                <div className="callout-title">Immediate rejections</div>
                <ul className="callout-list">
                  <li>Sunglasses covering eyes</li>
                  <li>Heavy filters or face-tune</li>
                  <li>Group photos with others</li>
                  <li>Blurry mirror selfies</li>
                </ul>
              </div>
            </div>

            <div className="dropzone" style={{ marginTop: 12 }}>
              <div className="dropzone-title">Drag & drop photos here, or click to browse</div>
              <div className="dropzone-sub">
                JPG/PNG only · Select {minSamples}-{maxSamples} photos
              </div>
              <input
                className="dropzone-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => void uploadFiles(e.target.files)}
                disabled={uploadingCount > 0}
              />
              {uploadingCount > 0 ? (
                <div className="muted" style={{ marginTop: 8 }}>
                  Uploading… ({uploadingCount} selected)
                </div>
              ) : null}
              {uploadsError ? <div style={{ marginTop: 8, color: "var(--danger)" }}>{uploadsError}</div> : null}
            </div>
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Your training photos</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              We use the photos you upload here for training and the first content batch.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="badge">
                Selected: {sampleSet.length}/{maxSamples} (min {minSamples})
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                Total uploaded: {postsNewestFirst.length}
              </span>
            </div>

            {postsLoading ? <p className="muted">Loading uploads…</p> : null}
            {!postsLoading && postsNewestFirst.length === 0 ? (
              <p className="muted">No uploads yet.</p>
            ) : null}

            {!postsLoading && postsNewestFirst.length > 0 ? (
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                {postsNewestFirst.slice(0, maxSamples).map((post) => {
                  return (
                    <div key={post.id} className="card" style={{ padding: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 900, fontSize: 12 }}>Sample</div>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => void deletePost(post)}
                          disabled={!!deletingPostIds[post.id]}
                          style={{ padding: "6px 10px" }}
                        >
                          {deletingPostIds[post.id] ? "Deleting…" : "Delete"}
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
            ) : null}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Request your first batch</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              Your plan defines how many scenes you can request and the total images included.
            </p>

            {entitlementsLoading ? <p className="muted">Loading your plan…</p> : null}
            {entitlementsError ? <p style={{ color: "var(--danger)" }}>{entitlementsError}</p> : null}
            {entitlements ? (
              <div className="card" style={{ padding: 12, marginTop: 10 }}>
                <div style={{ fontWeight: 900 }}>{entitlements.planName}</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  Included: <strong>{includedImages}</strong> images across up to{" "}
                  <strong>{maxScenes}</strong> scenes.
                </div>
              </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
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
              <div className="card" style={{ padding: 10 }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  Images allocated
                </div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>
                  {selectedTotalImages}/{includedImages}
                </div>
                {!imageSplitOk ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    Adjust counts until totals match.
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12 }}>
                    Totals match your plan.
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>Scenes (max {maxScenes})</div>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setSceneImageCounts(distributeCounts(selectedScenes, includedImages))}
                  disabled={selectedScenes.length === 0 || isSubmittingRequest}
                >
                  Auto-split
                </button>
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 10,
                }}
              >
                {SCENE_PRESETS.map((s) => {
                  const checked = selectedScenes.includes(s.key);
                  const disabled = !checked && selectedScenes.length >= maxScenes;
                  const short = s.prompt.length > 68 ? `${s.prompt.slice(0, 68)}…` : s.prompt;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`card ${checked ? "step-active" : ""}`}
                      onClick={() => toggleScene(s.key)}
                      disabled={disabled || isSubmittingRequest}
                      style={{ padding: 12, textAlign: "left", cursor: disabled ? "not-allowed" : "pointer" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div style={{ fontWeight: 900 }}>{s.label}</div>
                        <span className="badge">{checked ? "Selected" : disabled ? "Limit" : "Add"}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {short}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedScenes.length > 0 ? (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                {selectedScenes.map((k) => {
                  const label = SCENE_PRESETS.find((s) => s.key === k)?.label ?? k;
                  return (
                    <div key={k} className="card" style={{ padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div style={{ fontWeight: 900 }}>{label}</div>
                        <button className="btn btn-ghost" type="button" onClick={() => toggleScene(k)} disabled={isSubmittingRequest}>
                          Remove
                        </button>
                      </div>
                      <label style={{ display: "block", marginTop: 10 }}>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                          Images for this scene
                        </div>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={includedImages}
                          value={sceneImageCounts[k] ?? 0}
                          onChange={(e) => setSceneCount(k, Number(e.target.value))}
                          disabled={isSubmittingRequest}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : null}

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

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="btn btn-primary"
                onClick={() => void submitGenerationRequest()}
                disabled={!entitlements || !sampleCountOk || !imageSplitOk || isSubmittingRequest}
                type="button"
              >
                {isSubmittingRequest ? "Submitting…" : "Submit request"}
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                Upload {minSamples}-{maxSamples} photos · Select scenes · Totals must equal {includedImages} images.
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

            {latestRequest ? (
              <div style={{ marginTop: 10 }} className="muted">
                Last request: <code>{latestRequest.id}</code> · Status{" "}
                <span className="badge">{latestRequest.status}</span>
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {step === 3 ? (
        <section className="card" style={{ textAlign: "center", padding: 28 }}>
          <div className="badge" style={{ margin: "0 auto 12px auto" }}>
            Submitted
          </div>
          <h1 style={{ marginTop: 0 }}>You’re all set</h1>
          <p className="muted" style={{ maxWidth: 640, margin: "0 auto" }}>
            Your training photos have been submitted. Our team will review them and start generation shortly.
          </p>

          <div className="card" style={{ maxWidth: 720, margin: "18px auto 0 auto", textAlign: "left" }}>
            <h3 style={{ marginTop: 0 }}>What happens next?</h3>
            <ul style={{ marginBottom: 0 }}>
              <li>We validate and process your photos</li>
              <li>We review the request and approve it</li>
              <li>Generation starts after approval</li>
            </ul>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
            <Link className="btn btn-primary" href="/start">
              Start Here
            </Link>
            <Link className="btn btn-ghost" href="/">
              Home
            </Link>
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="muted" style={{ fontSize: 12 }}>
          Signed in as <code>{userId}</code>
        </div>
        {brief ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Brief saved for <strong>{brief.handle}</strong>
          </div>
        ) : null}
      </section>
    </div>
  );
}

