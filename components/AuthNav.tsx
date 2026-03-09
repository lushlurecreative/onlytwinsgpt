"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export default function AuthNav() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(data.user ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      router.refresh();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
    router.push("/");
  };

  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <Link href="/login" className="nav-link">
        Log in
      </Link>
    );
  }

  // Keep /login focused on authentication actions only.
  if (pathname === "/login") {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-700 truncate max-w-[220px]">
        {user.email ?? "Account"}
      </span>
      <button onClick={onLogout} className="text-sm font-medium hover:underline" type="button">
        Log out
      </button>
    </div>
  );
}
