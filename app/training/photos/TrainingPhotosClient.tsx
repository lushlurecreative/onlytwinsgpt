"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

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
    <PremiumCard style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>Upload area</h2>
      <p style={{ opacity: 0.8 }}>Select a photo, then click upload.</p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={status === "uploading"}
        />
        <PremiumButton type="button" onClick={onUpload} loading={status === "uploading"} disabled={!file}>
          Upload Photos
        </PremiumButton>
      </div>

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

      {signedUrl ? (
        <p style={{ marginTop: 6 }}>
          Preview link:{" "}
          <a href={signedUrl} target="_blank" rel="noreferrer">
            Open uploaded image
          </a>
        </p>
      ) : null}
    </PremiumCard>
  );
}
