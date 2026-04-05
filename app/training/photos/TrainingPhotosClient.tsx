"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

type Status = "idle" | "uploading" | "validating" | "training" | "done" | "error";

type PhotoSetData = {
  id: string;
  status: string;
  photo_count: number;
  approved_count: number;
  rejected_count: number;
};

type PhotoData = {
  id: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  validation_status: "pending" | "passed" | "warned" | "failed";
  validation_notes: string | null;
  signedUrl: string | null;
  created_at: string;
};

type ReadinessData = {
  isReady: boolean;
  reasons: string[];
  summary: {
    total: number;
    passed: number;
    warned: number;
    failed: number;
    pending: number;
    approvedRatio: number;
  };
};

const MIN_PHOTOS = 10;
const MAX_PHOTOS = 50;

export default function TrainingPhotosClient() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [photoSet, setPhotoSet] = useState<PhotoSetData | null>(null);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [replacingPath, setReplacingPath] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const loadPhotoSet = useCallback(async () => {
    try {
      const response = await fetch("/api/training/photo-sets");
      const result = (await response.json().catch(() => ({}))) as {
        set?: PhotoSetData;
        photos?: PhotoData[];
        readiness?: ReadinessData;
        error?: string;
      };
      if (!response.ok) {
        setStatus("error");
        setMessage(result.error ?? "Could not load photo set.");
        return;
      }
      setPhotoSet(result.set ?? null);
      setPhotos(result.photos ?? []);
      setReadiness(result.readiness ?? null);
    } catch {
      setStatus("error");
      setMessage("Could not load photos.");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    void loadPhotoSet();
  }, [loadPhotoSet]);

  const totalCount = photos.length;
  const remainingToMinimum = Math.max(0, MIN_PHOTOS - totalCount);
  const remainingCapacity = Math.max(0, MAX_PHOTOS - totalCount);

  const minimumStatusText = useMemo(() => {
    if (remainingToMinimum === 0) {
      return `Minimum reached. You can upload up to ${MAX_PHOTOS} total photos.`;
    }
    return `Upload at least ${remainingToMinimum} more photo${remainingToMinimum === 1 ? "" : "s"} to reach the minimum of ${MIN_PHOTOS}.`;
  }, [remainingToMinimum]);

  const onUpload = async () => {
    if (selectedFiles.length === 0 || status === "uploading") return;
    if (selectedFiles.length > remainingCapacity) {
      setStatus("error");
      setMessage(
        `You can upload ${remainingCapacity} more photo${remainingCapacity === 1 ? "" : "s"} before reaching the ${MAX_PHOTOS} photo maximum.`
      );
      return;
    }

    setStatus("uploading");
    setMessage("");

    let uploadedCount = 0;
    for (const file of selectedFiles) {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        objectPath?: string;
      };

      if (!response.ok || !result.objectPath) {
        setStatus("error");
        setMessage(result.error ?? `Upload failed for ${file.name}.`);
        // Refresh to show what was uploaded so far
        void loadPhotoSet();
        return;
      }
      uploadedCount++;
    }

    setSelectedFiles([]);
    setStatus("done");
    setMessage(`${uploadedCount} photo${uploadedCount === 1 ? "" : "s"} uploaded.`);
    void loadPhotoSet();
  };

  const onDelete = async (storagePath: string) => {
    if (busyPath) return;
    setBusyPath(storagePath);
    setMessage("");
    const response = await fetch("/api/uploads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectPath: storagePath }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setStatus("error");
      setMessage(result.error ?? "Could not delete photo.");
      setBusyPath(null);
      return;
    }

    setBusyPath(null);
    setStatus("done");
    setMessage("Photo deleted.");
    void loadPhotoSet();
  };

  const onReplace = async (storagePath: string, file: File | null) => {
    if (!file || busyPath || replacingPath) return;
    setReplacingPath(storagePath);
    setStatus("uploading");
    setMessage("");

    // Upload new file
    const formData = new FormData();
    formData.append("file", file);
    const uploadResponse = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });
    const uploadResult = (await uploadResponse.json().catch(() => ({}))) as {
      error?: string;
      objectPath?: string;
    };
    if (!uploadResponse.ok || !uploadResult.objectPath) {
      setStatus("error");
      setMessage(uploadResult.error ?? "Could not replace photo.");
      setReplacingPath(null);
      return;
    }

    // Delete old file
    const deleteResponse = await fetch("/api/uploads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectPath: storagePath }),
    });
    const deleteResult = (await deleteResponse.json().catch(() => ({}))) as { error?: string };
    if (!deleteResponse.ok) {
      setStatus("error");
      setMessage(deleteResult.error ?? "Uploaded replacement, but failed to remove previous photo.");
      setReplacingPath(null);
      void loadPhotoSet();
      return;
    }

    setReplacingPath(null);
    setStatus("done");
    setMessage("Photo replaced.");
    void loadPhotoSet();
  };

  const onValidate = async () => {
    if (!photoSet || status === "validating") return;
    setStatus("validating");
    setMessage("Validating photos...");

    const response = await fetch(`/api/training/photo-sets/${photoSet.id}/validate`, {
      method: "POST",
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      readiness?: ReadinessData;
    };

    if (!response.ok) {
      setStatus("error");
      setMessage(result.error ?? "Validation failed.");
      return;
    }

    setStatus("done");
    setMessage("Validation complete.");
    void loadPhotoSet();
  };

  const onStartTraining = async () => {
    if (!photoSet) return;
    setStatus("training");
    setMessage("Starting training...");

    const response = await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoSetId: photoSet.id }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      job?: { id: string };
    };

    if (!response.ok) {
      setStatus("error");
      setMessage(result.error ?? "Could not start training.");
      return;
    }

    setStatus("done");
    setMessage("Training started. You will be notified when your model is ready.");
    void loadPhotoSet();
  };

  const validationBadge = (vs: string) => {
    switch (vs) {
      case "passed":
        return <span style={{ color: "var(--success)", fontSize: 12, fontWeight: 600 }}>Passed</span>;
      case "warned":
        return <span style={{ color: "#e6a817", fontSize: 12, fontWeight: 600 }}>Warning</span>;
      case "failed":
        return <span style={{ color: "var(--danger)", fontSize: 12, fontWeight: 600 }}>Failed</span>;
      default:
        return <span style={{ color: "var(--muted)", fontSize: 12 }}>Pending</span>;
    }
  };

  const setStatusLabel = photoSet?.status
    ? {
        draft: "Draft",
        uploaded: "Uploaded",
        validating: "Validating...",
        ready: "Ready for training",
        rejected: "Needs more photos",
        training: "Training in progress",
        trained: "Training complete",
        failed: "Training failed",
      }[photoSet.status] ?? photoSet.status
    : null;

  const setStatusColor = photoSet?.status
    ? {
        draft: "var(--muted)",
        uploaded: "var(--primary)",
        validating: "#e6a817",
        ready: "var(--success)",
        rejected: "var(--danger)",
        training: "#e6a817",
        trained: "var(--success)",
        failed: "var(--danger)",
      }[photoSet.status] ?? "var(--muted)"
    : "var(--muted)";

  const canValidate =
    photoSet &&
    ["draft", "uploaded"].includes(photoSet.status) &&
    totalCount >= MIN_PHOTOS;

  const canStartTraining =
    photoSet?.status === "ready" && readiness?.isReady;

  return (
    <div className="training-stack">
      {/* Set status bar */}
      {photoSet && (
        <PremiumCard style={{ padding: "12px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontWeight: 600 }}>Dataset Status:</span>
              <span style={{ color: setStatusColor, fontWeight: 600 }}>{setStatusLabel}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
              <span>{totalCount} photo{totalCount !== 1 ? "s" : ""}</span>
              {readiness && readiness.summary.passed > 0 && (
                <>
                  <span style={{ color: "var(--success)" }}>{readiness.summary.passed} passed</span>
                  {readiness.summary.warned > 0 && (
                    <span style={{ color: "#e6a817" }}>{readiness.summary.warned} warned</span>
                  )}
                  {readiness.summary.failed > 0 && (
                    <span style={{ color: "var(--danger)" }}>{readiness.summary.failed} failed</span>
                  )}
                </>
              )}
            </div>
          </div>
        </PremiumCard>
      )}

      {/* Upload card */}
      <PremiumCard className="training-dropzone-card">
        <h2 style={{ marginTop: 0 }}>Training Photo Uploader</h2>
        <p className="wizard-copy">
          Upload a curated set of photos. The system uses these images for twin training and generation quality.
        </p>
        <p style={{ marginTop: 8, color: remainingToMinimum > 0 ? "var(--danger)" : "var(--success)" }}>
          {minimumStatusText}
        </p>

        <div className="training-dropzone">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
            disabled={status === "uploading" || status === "validating" || status === "training" || remainingCapacity === 0}
          />
          <div className="muted">Drag or browse · Min {MIN_PHOTOS} · Max {MAX_PHOTOS}</div>
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <PremiumButton
            type="button"
            onClick={onUpload}
            loading={status === "uploading"}
            disabled={selectedFiles.length === 0 || remainingCapacity === 0}
          >
            Upload Photos
          </PremiumButton>
          {canValidate && (
            <PremiumButton
              type="button"
              onClick={onValidate}
              loading={status === "validating"}
              disabled={status === "validating"}
            >
              Validate Photos
            </PremiumButton>
          )}
          {canStartTraining && (
            <PremiumButton
              type="button"
              onClick={onStartTraining}
              loading={status === "training"}
              disabled={status === "uploading" || status === "validating" || status === "training"}
            >
              Start Training
            </PremiumButton>
          )}
        </div>
      </PremiumCard>

      {/* Selected files feedback */}
      {selectedFiles.length > 0 && (
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Ready to upload: {selectedFiles.length} selected photo{selectedFiles.length === 1 ? "" : "s"}.
        </p>
      )}

      {/* Status message */}
      {message && (
        <motion.p
          style={{ marginTop: 10, color: status === "error" ? "var(--danger)" : "var(--success)" }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {message}
        </motion.p>
      )}

      {/* Readiness reasons */}
      {readiness && !readiness.isReady && readiness.reasons.length > 0 && photoSet?.status !== "draft" && (
        <PremiumCard style={{ borderLeft: "3px solid var(--danger)", padding: "12px 20px" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Not ready for training</h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {readiness.reasons.map((reason, idx) => (
              <li key={idx} className="wizard-copy" style={{ fontSize: 13, marginBottom: 4 }}>
                {reason}
              </li>
            ))}
          </ul>
        </PremiumCard>
      )}

      {/* Photo gallery */}
      {loadingData ? (
        <PremiumCard>
          <div className="skeleton-line w-40" />
          <div className="training-gallery-grid">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={`photo-skeleton-${idx}`} className="premium-card training-photo-card">
                <div className="skeleton-square" />
                <div className="skeleton-line w-80" />
                <div className="skeleton-line w-40" />
              </div>
            ))}
          </div>
        </PremiumCard>
      ) : photos.length > 0 ? (
        <PremiumCard>
          <h3 style={{ margin: 0 }}>Uploaded photos ({photos.length})</h3>
          <div className="training-gallery-grid">
            {photos.map((photo) => (
              <article key={photo.id} className="premium-card training-photo-card">
                {photo.signedUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.signedUrl}
                    alt="Training photo"
                    style={{ width: "100%", borderRadius: 10, aspectRatio: "1 / 1", objectFit: "cover" }}
                  />
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {photo.width && photo.height ? `${photo.width}x${photo.height}` : ""}
                    {photo.file_size ? ` · ${Math.round(photo.file_size / 1024)}KB` : ""}
                  </span>
                  {validationBadge(photo.validation_status)}
                </div>
                {photo.validation_notes && (
                  <p style={{
                    fontSize: 11,
                    color: photo.validation_status === "failed" ? "var(--danger)" : "#e6a817",
                    margin: "4px 0 0",
                    lineHeight: 1.3,
                  }}>
                    {photo.validation_notes}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => onDelete(photo.storage_path)}
                    disabled={busyPath === photo.storage_path || replacingPath === photo.storage_path}
                  >
                    {busyPath === photo.storage_path ? "Deleting..." : "Delete"}
                  </button>
                  <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
                    Replace
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        void onReplace(photo.storage_path, file);
                        event.currentTarget.value = "";
                      }}
                      disabled={busyPath === photo.storage_path || replacingPath === photo.storage_path}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
        </PremiumCard>
      ) : (
        <PremiumCard className="premium-empty">
          <div className="empty-visual">I</div>
          <h3 style={{ marginTop: 0 }}>No photos uploaded yet</h3>
          <p className="wizard-copy">
            Start with a high-quality batch to unlock model training. Your gallery will populate here instantly.
          </p>
        </PremiumCard>
      )}
    </div>
  );
}
