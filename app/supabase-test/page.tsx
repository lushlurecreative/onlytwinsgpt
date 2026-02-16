"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SupabaseTestPage() {
  const [status, setStatus] = useState<string>("Testing...");

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        setStatus(`✅ Connected. Session: ${data.session ? "present" : "none"}`);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setStatus(`❌ Error: ${message}`);
      }
    })();
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Supabase Test</h1>
      <p>{status}</p>
    </main>
  );
}
