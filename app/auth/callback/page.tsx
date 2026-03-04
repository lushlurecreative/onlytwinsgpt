"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClientComponentClient();

  useEffect(() => {
    const finishOAuth = async () => {
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          router.replace("/login?error=oauth");
          return;
        }
      }

      router.replace("/dashboard");
    };

    finishOAuth();
  }, [params, router, supabase]);

  return (
    <div style={{ padding: 40 }}>
      Signing you in...
    </div>
  );
}
