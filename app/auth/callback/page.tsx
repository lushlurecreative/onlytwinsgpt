"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "/dashboard";

    const finishLogin = async () => {
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        await fetch("/api/thank-you/complete", { method: "POST" }).catch(() => null);
        router.replace(next);
      } else {
        router.replace("/login?error=oauth");
      }
    };

    finishLogin();
  }, [router]);

  return (
    <motion.p
      style={{ padding: 40 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      Signing you in...
    </motion.p>
  );
}
