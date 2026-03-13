"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const DEBUG = process.env.NODE_ENV === "development";

export default function LogoutPage() {
  const done = useRef(false);
  const [debug, setDebug] = useState<{ step?: string; sessionAfter?: boolean }>({});

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const run = async () => {
      if (DEBUG) setDebug((d) => ({ ...d, step: "server logout" }));
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      } catch {
        // continue to client signOut
      }

      if (DEBUG) setDebug((d) => ({ ...d, step: "client signOut" }));
      try {
        await supabase.auth.signOut();
      } catch (e) {
        if (DEBUG) setDebug((d) => ({ ...d, step: `signOut error: ${String(e)}` }));
      }

      if (DEBUG) {
        const { data } = await supabase.auth.getSession();
        setDebug((d) => ({ ...d, sessionAfter: !!data.session }));
      }

      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("sb-") || k.includes("supabase"))) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && (k.startsWith("sb-") || k.includes("supabase"))) sessionStorage.removeItem(k);
        }
      } catch {
        // ignore
      }

      if (DEBUG) setDebug((d) => ({ ...d, step: "redirect to /" }));
      window.location.replace("/");
    };

    void run();
  }, []);

  return (
    <main style={{ padding: 40, maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
      <p style={{ fontSize: 18 }}>Logging out…</p>
      {DEBUG && (
        <pre style={{ marginTop: 16, fontSize: 12, textAlign: "left", overflow: "auto" }}>
          {JSON.stringify(debug, null, 2)}
        </pre>
      )}
    </main>
  );
}
