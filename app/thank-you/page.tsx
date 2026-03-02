"use client";

import { useEffect, useMemo, useState } from "react";
import BrandName from "@/app/components/BrandName";
import { supabase } from "@/lib/supabase";

type ThankYouState = "processing" | "ready" | "error";

type SessionResponse = {
  state?: ThankYouState;
  error?: string;
  reason?: string;
  email?: string;
  payment_status?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

export default function ThankYouPage() {
  const [state, setState] = useState<ThankYouState>("processing");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [magicMsg, setMagicMsg] = useState("");
  const [meta, setMeta] = useState<{
    payment_status?: string | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
  }>({});

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const isAuthed = !!data.user;
      if (isAuthed) {
        window.location.replace("/dashboard");
        return;
      }
      setAuthLoading(false);
    }

    void checkAuth();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) window.location.replace("/dashboard");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 40;
    const pollDelayMs = 2000;

    (async () => {
      while (!cancelled && pollCount < maxPolls) {
        try {
          const res = await fetch("/api/thank-you/session");
          const data = (await res.json().catch(() => ({}))) as SessionResponse;
          if (cancelled) return;

          setMeta({
            payment_status: data.payment_status ?? null,
            stripe_customer_id: data.stripe_customer_id ?? null,
            stripe_subscription_id: data.stripe_subscription_id ?? null,
          });
          if (data.email) {
            setEmail(data.email);
            setMagicEmail((prev) => prev || data.email || "");
          }

          if (!res.ok || data.state === "error") {
            setState("error");
            setError(data.error ?? "We couldn't confirm payment. Contact support.");
            return;
          }
          if (data.state === "ready") {
            setState("ready");
            return;
          }

          setState("processing");
          pollCount += 1;
          await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
        } catch {
          setState("error");
          setError("We couldn't confirm payment. Contact support.");
          return;
        }
      }
      if (!cancelled) {
        setState("error");
        setError("We couldn't confirm payment. Contact support.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loginWithGoogle() {
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  async function sendMagicLink() {
    const target = magicEmail.trim().toLowerCase();
    if (!target) {
      setMagicMsg("Enter your email to receive a magic link.");
      return;
    }
    setMagicMsg("Sending magic link...");
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined;
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: target,
      options: { emailRedirectTo: redirectTo },
    });
    if (otpError) {
      setMagicMsg(`Failed: ${otpError.message}`);
      return;
    }
    setMagicMsg("Magic link sent. Check your email.");
  }

  const supportText = useMemo(
    () => "We couldn't confirm payment. Contact support.",
    []
  );

  return (
    <main style={{ padding: 48, maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
      <h1 style={{ marginTop: 0, fontSize: 28 }}>
        <BrandName /> Thanks for subscribing
      </h1>

      {state === "processing" ? (
        <>
          <p style={{ marginBottom: 8 }}>Finalizing your account...</p>
          <p className="muted" style={{ marginBottom: 20 }}>
            Please keep this page open for a moment.
          </p>
        </>
      ) : null}

      {state === "error" ? (
        <>
          <p style={{ color: "#c00", marginBottom: 8 }}>{error || supportText}</p>
          <p className="muted" style={{ marginBottom: 20 }}>{supportText}</p>
        </>
      ) : null}

      {state === "ready" && !authLoading ? (
        <>
          <p className="muted" style={{ marginBottom: 12 }}>
            Your payment is confirmed. Sign in to continue.
          </p>
          <div style={{ display: "grid", gap: 10, maxWidth: 360, margin: "0 auto" }}>
            <button type="button" className="btn btn-primary" onClick={loginWithGoogle}>
              Continue with Google
            </button>
            <input
              type="email"
              value={magicEmail}
              onChange={(e) => setMagicEmail(e.target.value)}
              placeholder={email || "Email for magic link"}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #444",
              }}
            />
            <button type="button" className="btn btn-secondary" onClick={sendMagicLink}>
              Send magic link
            </button>
            {magicMsg ? <p className="muted" style={{ margin: 0 }}>{magicMsg}</p> : null}
          </div>
        </>
      ) : null}

      <div style={{ marginTop: 20, fontSize: 12, opacity: 0.8 }}>
        {meta.payment_status ? <div>Payment: {meta.payment_status}</div> : null}
        {meta.stripe_customer_id ? <div>Customer: {meta.stripe_customer_id}</div> : null}
        {meta.stripe_subscription_id ? <div>Subscription: {meta.stripe_subscription_id}</div> : null}
      </div>
    </main>
  );
}
