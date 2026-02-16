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

  async function signUp() {
    setMsg("Working...");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setMsg(`❌ ${error.message}`);
      return;
    }
    setMsg("✅ Signup OK.");
    window.location.href = redirectTo;
  }

  async function signIn() {
    setMsg("Working...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(`❌ ${error.message}`);
      return;
    }
    setMsg("✅ Signed in.");
    window.location.href = redirectTo;
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
      <p>Redirect after login: <code>{redirectTo}</code></p>

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

      <p style={{ marginTop: 18, opacity: 0.8 }}>
        After signing in, go to <code>/start</code>
      </p>
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
