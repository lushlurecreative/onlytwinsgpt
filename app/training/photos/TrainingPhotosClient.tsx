"use client";

import { useState } from "react";

type Status = "idle" | "uploading" | "done" | "error";

export default function TrainingPhotosClient() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const onUpload = async () => {
    if (!file || status === "uploading") return;
    setStatus("uploading");
    setMessage("");
    setSignedUrl(null);

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });

    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      signedUrl?: string | null;
    };

    if (!response.ok) {
      setStatus("error");
      setMessage(result.error ?? "Upload failed. Please try again.");
      return;
    }

    setStatus("done");
    setMessage("Upload complete. You can continue uploading more photos.");
    setSignedUrl(result.signedUrl ?? null);
    setFile(null);
  };

  return (
    <section style={{ border: "1px solid #333", borderRadius: 12, padding: 16, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>Upload area</h2>
      <p style={{ opacity: 0.8 }}>Select a photo, then click upload.</p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={status === "uploading"}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={onUpload}
          disabled={!file || status === "uploading"}
        >
          {status === "uploading" ? "Uploading..." : "Upload Photos"}
        </button>
      </div>

      {message ? (
        <p style={{ marginTop: 10, color: status === "error" ? "var(--danger)" : "var(--success)" }}>{message}</p>
      ) : null}

      {signedUrl ? (
        <p style={{ marginTop: 6 }}>
          Preview link:{" "}
          <a href={signedUrl} target="_blank" rel="noreferrer">
            Open uploaded image
          </a>
        </p>
      ) : null}
    </section>
  );
}
