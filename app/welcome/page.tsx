"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import BrandName from "@/app/components/BrandName";

type WelcomeSessionState = "processing" | "ready" | "error";

type WelcomeSessionResponse = {
  state?: WelcomeSessionState;
  ready?: boolean;
  email?: string;
  error?: string;
  reason?: string;
  payment_status?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

function WelcomePageInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id")?.trim() ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionState, setSessionState] = useState<WelcomeSessionState>("processing");
  const [reason, setReason] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<string>("");
  const [stripeCustomerId, setStripeCustomerId] = useState<string>("");
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState<string>("");
  const [pollNonce, setPollNonce] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      setSessionState("error");
      setError("Missing session_id. Please start from pricing.");
      return;
    }
    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 40;
    const pollDelayMs = 2000;
    (async () => {
      while (!cancelled && pollCount < maxPolls) {
        try {
          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 10000);
          const res = await fetch(
            `/api/welcome/session?session_id=${encodeURIComponent(sessionId)}`,
            { signal: ctrl.signal }
          );
          clearTimeout(timeout);
          const data = (await res.json().catch(() => ({}))) as WelcomeSessionResponse;
          if (cancelled) return;
          setReason(data.reason ?? "");
          setPaymentStatus(data.payment_status ?? "");
          setStripeCustomerId(data.stripe_customer_id ?? "");
          setStripeSubscriptionId(data.stripe_subscription_id ?? "");

          if (!res.ok) {
            setSessionState("error");
            setError(data.error ?? "Invalid or expired session");
            return;
          }

          if (data.state === "ready" || (data.ready && data.email)) {
            if (!data.email) {
              setSessionState("error");
              setError("Session is ready but missing account email. Please refresh.");
              return;
            }
            setEmail(data.email);
            setSessionState("ready");
            return;
          }
          setSessionState("processing");
          pollCount += 1;
          await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
        } catch {
          if (!cancelled) {
            setSessionState("error");
            setError("Could not verify account state. Please retry.");
            return;
          }
        }
      }
      if (!cancelled) {
        setSessionState("error");
        setError("Account setup timed out. Please refresh this page.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, pollNonce]);

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
          confirm_password: confirmPassword,
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

  if (sessionState === "processing") {
    return (
      <main style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
          <BrandName /> Thanks for subscribing
        </h1>
        <p style={{ marginBottom: 12 }}>
          Your payment is confirmed. We are setting up your account now.
        </p>
        <p className="muted" style={{ marginBottom: 16 }}>
          This usually takes a few seconds while webhook provisioning completes.
        </p>
        <div style={{ padding: 12, border: "1px solid #333", borderRadius: 8, marginBottom: 16 }}>
          <p style={{ margin: 0 }}><strong>Status:</strong> Processing</p>
          {paymentStatus ? <p style={{ margin: "6px 0 0 0" }}><strong>Payment:</strong> {paymentStatus}</p> : null}
          {stripeCustomerId ? <p style={{ margin: "6px 0 0 0" }}><strong>Customer:</strong> {stripeCustomerId}</p> : null}
          {stripeSubscriptionId ? <p style={{ margin: "6px 0 0 0" }}><strong>Subscription:</strong> {stripeSubscriptionId}</p> : null}
          {reason ? <p style={{ margin: "6px 0 0 0" }}><strong>Step:</strong> {reason}</p> : null}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPollNonce((n) => n + 1)}
          >
            Retry account setup
          </button>
          <Link href="/login?redirectTo=/start" className="btn btn-secondary">
            Log in
          </Link>
          <Link href="/start" className="btn btn-secondary">
            Go to dashboard
          </Link>
        </div>
      </main>
    );
  }

  if (sessionState === "error") {
    return (
      <main style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
          <BrandName /> Welcome
        </h1>
        <p style={{ color: "#c00", marginBottom: 12 }}>{error || "Invalid or expired link."}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setError("");
              setSessionState("processing");
              setPollNonce((n) => n + 1);
            }}
          >
            Retry
          </button>
          <Link href="/pricing" className="btn btn-secondary">Return to pricing</Link>
          <Link href="/login?redirectTo=/start" className="btn btn-secondary">Log in</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
        <BrandName /> Set up your account
      </h1>
      <p className="muted" style={{ marginBottom: 20 }}>Thanks for subscribing. Choose a password and display name to finish.</p>
      <div style={{ padding: 12, border: "1px solid #333", borderRadius: 8, marginBottom: 16 }}>
        {paymentStatus ? <p style={{ margin: 0 }}><strong>Payment:</strong> {paymentStatus}</p> : null}
        {stripeCustomerId ? <p style={{ margin: "6px 0 0 0" }}><strong>Customer:</strong> {stripeCustomerId}</p> : null}
        {stripeSubscriptionId ? <p style={{ margin: "6px 0 0 0" }}><strong>Subscription:</strong> {stripeSubscriptionId}</p> : null}
      </div>

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
    <Suspense fallback={<main style={{ padding: 24 }}>Preparing welcome…</main>}>
      <WelcomePageInner />
    </Suspense>
  );
}
