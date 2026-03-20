"use client";

import { useState } from "react";

type Props = {
  next: string;
};

export default function ProfileSetupClient({ next }: Props) {
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, date_of_birth: dob, phone }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      window.location.href = next;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Set up your profile
          </h1>
          <p style={{ margin: 0, color: "var(--muted, #888)", fontSize: "0.95rem" }}>
            We need a few details before you get started.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="full_name" style={{ fontSize: "0.875rem", fontWeight: 500 }}>
              Full name <span style={{ color: "var(--error, #e5534b)" }}>*</span>
            </label>
            <input
              id="full_name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full legal name"
              required
              autoComplete="name"
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--border, #333)",
                background: "var(--input-bg, #111)",
                color: "inherit",
                fontSize: "1rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="dob" style={{ fontSize: "0.875rem", fontWeight: 500 }}>
              Date of birth <span style={{ color: "var(--error, #e5534b)" }}>*</span>
            </label>
            <input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
              max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--border, #333)",
                background: "var(--input-bg, #111)",
                color: "inherit",
                fontSize: "1rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted, #888)" }}>
              You must be 18 or older to use this platform.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="phone" style={{ fontSize: "0.875rem", fontWeight: 500 }}>
              Phone number <span style={{ color: "var(--muted, #888)", fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              autoComplete="tel"
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--border, #333)",
                background: "var(--input-bg, #111)",
                color: "inherit",
                fontSize: "1rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error ? (
            <p style={{ margin: 0, color: "var(--error, #e5534b)", fontSize: "0.9rem" }}>{error}</p>
          ) : null}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ marginTop: 4, padding: "12px 24px", fontSize: "1rem", fontWeight: 600 }}
          >
            {loading ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
