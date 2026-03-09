"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";
import { WHATSAPP_LINK, WHATSAPP_NUMBER_DISPLAY } from "@/lib/support";

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
  const router = useRouter();
  const supabase = createClient();
  const [state, setState] = useState<ThankYouState>("ready");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [magicMsg, setMagicMsg] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) router.replace("/dashboard");
    })();
  }, [router, supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/thank-you/session");
        const data = (await res.json().catch(() => ({}))) as SessionResponse;
        if (cancelled) return;

        if (data.email) {
          setEmail(data.email);
          setMagicEmail((prev) => prev || data.email || "");
        }

        if (!res.ok || data.state === "error") {
          setState("error");
          setError(data.error ?? "We couldn't confirm payment yet. Message us on WhatsApp.");
          return;
        }

        // Show spinner only when payment itself is not yet confirmed.
        setState(data.state === "processing" ? "processing" : "ready");
      } catch {
        if (!cancelled) {
          setState("error");
          setError("We couldn't confirm payment yet. Message us on WhatsApp.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loginWithGoogle() {
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://onlytwins.dev/auth/callback?next=/dashboard",
      },
    });
    if (oauthError) {
      setError(oauthError.message || "Google login failed.");
    }
  }

  async function sendMagicLink() {
    setError("");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://onlytwins.dev";
    const cleanEmail = magicEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setMagicMsg("Enter your email to receive a magic link.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid email.");
      return;
    }
    setMagicMsg("Sending magic link...");
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/dashboard` },
    });
    if (otpError) {
      setMagicMsg(`Failed: ${otpError.message}`);
      return;
    }
    setMagicMsg("Magic link sent. Check your email.");
  }

  const supportText = useMemo(
    () => "We couldn't confirm payment yet. Message us on WhatsApp.",
    []
  );

  return (
    <main style={{ padding: 48, maxWidth: 560, margin: "0 auto" }}>
      <PremiumCard style={{ textAlign: "center" }}>
        <h1 style={{ marginTop: 0, fontSize: 34, letterSpacing: "-0.02em" }}>Thanks for subscribing</h1>
        <p className="muted" style={{ marginBottom: 18, fontSize: 16 }}>
          Your workspace is ready. Continue with Google or magic link to enter your control center.
        </p>

        {state === "processing" ? (
          <>
            <p style={{ marginBottom: 20 }}>Verifying payment...</p>
          </>
        ) : null}

        {state === "error" ? (
          <>
            <p style={{ color: "#c00", marginBottom: 8 }}>{error || supportText}</p>
            <p className="muted" style={{ marginBottom: 20 }}>{supportText}</p>
            <a className="btn btn-secondary" href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
              WhatsApp: {WHATSAPP_NUMBER_DISPLAY}
            </a>
          </>
        ) : null}

        {state === "ready" ? (
          <>
            <div style={{ display: "grid", gap: 10, maxWidth: 360, margin: "0 auto" }}>
              <PremiumButton type="button" onClick={loginWithGoogle}>
                Continue with Google
              </PremiumButton>
              <input
                type="email"
                className="input"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                placeholder={email || "Email for magic link"}
              />
              <PremiumButton type="button" variant="secondary" onClick={sendMagicLink}>
                Email me a login link
              </PremiumButton>
              {magicMsg ? <p className="muted" style={{ margin: 0 }}>{magicMsg}</p> : null}
            </div>
          </>
        ) : null}
      </PremiumCard>
    </main>
  );
}
