"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

function AuthCallbackContent() {
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

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Signing you in...</div>}>
      <AuthCallbackContent />
    </Suspense>
  );
}
