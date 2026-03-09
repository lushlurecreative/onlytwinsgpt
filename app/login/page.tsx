"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { supabase } from "@/lib/supabase";
import BrandName from "@/app/components/BrandName";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

function LoginPageInner() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/start";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://onlytwins.dev";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string>("");

  function doRedirect() {
    const url = redirectTo + (redirectTo.includes("?") ? "&" : "?") + "_=" + Date.now();
    window.location.replace(url);
  }

  async function signUp() {
    setMsg("Working...");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setMsg(`❌ ${error.message}`);
      return;
    }
    setMsg("✅ Signup OK.");
    if (data.session) {
      setTimeout(doRedirect, 400);
    } else {
      setMsg("✅ Check your email to confirm, then sign in.");
    }
  }

  async function signIn() {
    setMsg("Working...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(`❌ ${error.message}`);
      return;
    }
    setMsg("✅ Signed in.");
    setTimeout(doRedirect, 400);
  }

  async function continueWithGoogle() {
    setMsg("Redirecting to Google...");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });
    if (error) {
      setMsg(`❌ ${error.message}`);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <PremiumCard>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
          <BrandName /> Login
        </h1>

        <label style={{ display: "block", marginBottom: 8 }}>Email</label>
        <input
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ marginBottom: 12 }}
        />

        <label style={{ display: "block", marginBottom: 8 }}>Password</label>
        <input
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          style={{ marginBottom: 12 }}
        />

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <PremiumButton onClick={signUp}>Sign up</PremiumButton>
          <PremiumButton onClick={signIn}>Sign in</PremiumButton>
          <PremiumButton variant="secondary" onClick={continueWithGoogle}>
            Log in with Google
          </PremiumButton>
          <PremiumButton variant="secondary" onClick={continueWithGoogle}>
            Sign up with Google
          </PremiumButton>
        </div>

        <p>{msg}</p>

        {redirectTo !== "/start" ? (
          <p style={{ marginTop: 18, opacity: 0.8 }}>
            You will be taken to your destination after signing in.
          </p>
        ) : null}
      </PremiumCard>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24, maxWidth: 420 }}>Loading...</main>}>
      <LoginPageInner />
    </Suspense>
  );
}
