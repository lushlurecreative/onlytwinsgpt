"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { supabase } from "@/lib/supabase";
import BrandName from "@/app/components/BrandName";

function LoginPageInner() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/start";

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

  async function signOut() {
    setMsg("Working...");
    const { error } = await supabase.auth.signOut();
    setMsg(error ? `❌ ${error.message}` : "✅ Signed out.");
  }

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        <BrandName /> Login
      </h1>

      <label style={{ display: "block", marginBottom: 8 }}>Email</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          width: "100%",
          padding: 10,
          marginBottom: 12,
          borderRadius: 8,
          border: "1px solid #444",
        }}
      />

      <label style={{ display: "block", marginBottom: 8 }}>Password</label>
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        style={{
          width: "100%",
          padding: 10,
          marginBottom: 12,
          borderRadius: 8,
          border: "1px solid #444",
        }}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={signUp} style={{ padding: "10px 12px", borderRadius: 8 }}>
          Sign up
        </button>
        <button onClick={signIn} style={{ padding: "10px 12px", borderRadius: 8 }}>
          Sign in
        </button>
        <button onClick={signOut} style={{ padding: "10px 12px", borderRadius: 8 }}>
          Sign out
        </button>
      </div>

      <p>{msg}</p>

      {redirectTo !== "/start" ? (
        <p style={{ marginTop: 18, opacity: 0.8 }}>
          You will be taken to your destination after signing in.
        </p>
      ) : null}
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
