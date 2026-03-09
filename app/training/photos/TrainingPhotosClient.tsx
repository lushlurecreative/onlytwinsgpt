"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";
import ControlIcon from "@/components/ControlIcon";

type Status = "idle" | "uploading" | "done" | "error";
type UploadedFile = {
  objectPath: string;
  name: string;
  signedUrl: string | null;
  createdAt?: string | null;
};

const MIN_PHOTOS = 10;
const MAX_PHOTOS = 50;
const NOTES_KEY = "ot_training_photo_notes_v1";

export default function TrainingPhotosClient() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(NOTES_KEY);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [replacingPath, setReplacingPath] = useState<string | null>(null);
  const [loadingUploads, setLoadingUploads] = useState(true);

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/uploads", { method: "GET" });
      const result = (await response.json().catch(() => ({}))) as {
        files?: UploadedFile[];
        error?: string;
      };
      if (!response.ok) {
        setStatus("error");
        setMessage(result.error ?? "Could not load uploaded photos.");
        setLoadingUploads(false);
        return;
      }
      setUploadedFiles(result.files ?? []);
      setLoadingUploads(false);
    };
    void load();
  }, []);

  const totalCount = uploadedFiles.length;
  const remainingToMinimum = Math.max(0, MIN_PHOTOS - totalCount);
  const remainingCapacity = Math.max(0, MAX_PHOTOS - totalCount);

  const minimumStatusText = useMemo(() => {
    if (remainingToMinimum === 0) {
      return `Minimum reached. You can upload up to ${MAX_PHOTOS} total photos.`;
    }
    return `Upload at least ${remainingToMinimum} more photo${remainingToMinimum === 1 ? "" : "s"} to reach the minimum of ${MIN_PHOTOS}.`;
  }, [remainingToMinimum]);

  const persistNotes = (next: Record<string, string>) => {
    setNotes(next);
    try {
      window.localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    } catch {}
  };

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

    const newlyUploaded: UploadedFile[] = [];
    for (const file of selectedFiles) {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        signedUrl?: string | null;
        objectPath?: string;
      };

      if (!response.ok || !result.objectPath) {
        setStatus("error");
        setMessage(result.error ?? `Upload failed for ${file.name}. Please try again.`);
        return;
      }

      newlyUploaded.push({
        objectPath: result.objectPath,
        name: result.objectPath.split("/").pop() ?? file.name,
        signedUrl: result.signedUrl ?? null,
      });
    }

    setUploadedFiles((prev) => [...newlyUploaded, ...prev]);
    setStatus("done");
    setMessage(`${newlyUploaded.length} photo${newlyUploaded.length === 1 ? "" : "s"} uploaded.`);
    setSelectedFiles([]);
  };

  const onDelete = async (objectPath: string) => {
    if (busyPath) return;
    setBusyPath(objectPath);
    setMessage("");
    const response = await fetch("/api/uploads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectPath }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setStatus("error");
      setMessage(result.error ?? "Could not delete photo.");
      setBusyPath(null);
      return;
    }

    setUploadedFiles((prev) => prev.filter((item) => item.objectPath !== objectPath));
    const nextNotes = { ...notes };
    delete nextNotes[objectPath];
    persistNotes(nextNotes);
    setBusyPath(null);
    setStatus("done");
    setMessage("Photo deleted.");
  };

  const onReplace = async (objectPath: string, file: File | null) => {
    if (!file || busyPath || replacingPath) return;
    setReplacingPath(objectPath);
    setStatus("uploading");
    setMessage("");

    const formData = new FormData();
    formData.append("file", file);
    const uploadResponse = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });
    const uploadResult = (await uploadResponse.json().catch(() => ({}))) as {
      error?: string;
      signedUrl?: string | null;
      objectPath?: string;
    };
    if (!uploadResponse.ok || !uploadResult.objectPath) {
      setStatus("error");
      setMessage(uploadResult.error ?? "Could not replace photo.");
      setReplacingPath(null);
      return;
    }

    const deleteResponse = await fetch("/api/uploads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectPath }),
    });
    const deleteResult = (await deleteResponse.json().catch(() => ({}))) as { error?: string };
    if (!deleteResponse.ok) {
      setStatus("error");
      setMessage(deleteResult.error ?? "Uploaded replacement, but failed to remove previous photo.");
      setReplacingPath(null);
      return;
    }

    setUploadedFiles((prev) =>
      prev.map((item) =>
        item.objectPath === objectPath
          ? {
              ...item,
              objectPath: uploadResult.objectPath!,
              name: uploadResult.objectPath!.split("/").pop() ?? item.name,
              signedUrl: uploadResult.signedUrl ?? item.signedUrl,
              createdAt: new Date().toISOString(),
            }
          : item
      )
    );
    const nextNotes = { ...notes };
    const oldNote = nextNotes[objectPath];
    delete nextNotes[objectPath];
    if (oldNote) nextNotes[uploadResult.objectPath] = oldNote;
    persistNotes(nextNotes);
    setReplacingPath(null);
    setStatus("done");
    setMessage("Photo replaced.");
  };

  return (
    <div className="training-stack">
      <PremiumCard className="training-dropzone-card">
        <ControlIcon glyph="T" label="Training uploader" />
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
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
            disabled={status === "uploading" || remainingCapacity === 0}
          />
          <div className="muted">Drag or browse · Min {MIN_PHOTOS} · Max {MAX_PHOTOS}</div>
        </div>
        <div style={{ marginTop: 10 }}>
          <PremiumButton
            type="button"
            onClick={onUpload}
            loading={status === "uploading"}
            disabled={selectedFiles.length === 0 || remainingCapacity === 0}
          >
            Upload Photos
          </PremiumButton>
        </div>
      </PremiumCard>
      {selectedFiles.length > 0 ? (
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Ready to upload: {selectedFiles.length} selected photo{selectedFiles.length === 1 ? "" : "s"}.
        </p>
      ) : null}
      {message ? (
        <motion.p
          style={{ marginTop: 10, color: status === "error" ? "var(--danger)" : "var(--success)" }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {message}
        </motion.p>
      ) : null}

      {loadingUploads ? (
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
      ) : uploadedFiles.length > 0 ? (
        <PremiumCard>
          <h3 style={{ margin: 0 }}>Uploaded photos ({uploadedFiles.length})</h3>
          <div className="training-gallery-grid">
            {uploadedFiles.map((item) => (
              <article key={item.objectPath} className="premium-card training-photo-card">
                {item.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.signedUrl}
                    alt="Uploaded training photo"
                    style={{ width: "100%", borderRadius: 10, aspectRatio: "1 / 1", objectFit: "cover" }}
                  />
                ) : null}
                <input
                  className="input"
                  type="text"
                  placeholder="Optional notes"
                  value={notes[item.objectPath] ?? ""}
                  onChange={(event) =>
                    persistNotes({
                      ...notes,
                      [item.objectPath]: event.target.value,
                    })
                  }
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => onDelete(item.objectPath)}
                    disabled={busyPath === item.objectPath || replacingPath === item.objectPath}
                  >
                    {busyPath === item.objectPath ? "Deleting..." : "Delete"}
                  </button>
                  <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
                    Replace
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        void onReplace(item.objectPath, file);
                        event.currentTarget.value = "";
                      }}
                      disabled={busyPath === item.objectPath || replacingPath === item.objectPath}
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
