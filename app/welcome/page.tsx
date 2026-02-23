"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import BrandName from "@/app/components/BrandName";

function WelcomePageInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id")?.trim() ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [sessionInvalid, setSessionInvalid] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setSessionInvalid(true);
      setSessionLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/welcome/session?session_id=${encodeURIComponent(sessionId)}`
        );
        const data = (await res.json().catch(() => ({}))) as {
          email?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setSessionInvalid(true);
          setError(data.error ?? "Invalid or expired session");
        } else if (data.email) {
          setEmail(data.email);
        }
      } catch {
        if (!cancelled) {
          setSessionInvalid(true);
          setError("Failed to load session");
        }
      } finally {
        if (!cancelled) setSessionLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/welcome/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          email,
          password,
          displayName: displayName.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      window.location.replace("/start");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  if (!sessionLoaded) {
    return (
      <main style={{ padding: 24, maxWidth: 420 }}>
        <p>Loading...</p>
      </main>
    );
  }

  if (sessionInvalid) {
    return (
      <main style={{ padding: 24, maxWidth: 420 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
          <BrandName /> Welcome
        </h1>
        <p style={{ color: "#c00", marginBottom: 12 }}>{error || "Invalid or expired link."}</p>
        <p>
          <Link href="/pricing">Return to pricing</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        <BrandName /> Set up your account
      </h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Choose a password and display name to finish.
      </p>

      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 8 }}>Email</label>
        <input
          type="email"
          value={email}
          readOnly
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 12,
            borderRadius: 8,
            border: "1px solid #444",
            background: "#222",
            color: "#999",
          }}
        />

        <label style={{ display: "block", marginBottom: 8 }}>Password (min 8 characters)</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 12,
            borderRadius: 8,
            border: "1px solid #444",
          }}
        />

        <label style={{ display: "block", marginBottom: 8 }}>Confirm password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 12,
            borderRadius: 8,
            border: "1px solid #444",
          }}
        />

        <label style={{ display: "block", marginBottom: 8 }}>Display name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Optional"
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 16,
            borderRadius: 8,
            border: "1px solid #444",
          }}
        />

        {error ? (
          <p style={{ color: "#c00", marginBottom: 12 }}>{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary"
          style={{ width: "100%" }}
        >
          {loading ? "Saving..." : "Complete and sign in"}
        </button>
      </form>
    </main>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading...</main>}>
      <WelcomePageInner />
    </Suspense>
  );
}
