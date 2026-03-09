"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
  }, [router, supabase]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, []);

  const onLogout = async () => {
    setOpen(false);
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
    <div className="user-menu-wrap" ref={menuRef}>
      <button type="button" className="user-menu-trigger" onClick={() => setOpen((prev) => !prev)}>
        <span className="user-menu-avatar">{(user.email ?? "A").slice(0, 1).toUpperCase()}</span>
        <span className="user-menu-label">{user.email ?? "Account"}</span>
      </button>
      {open ? (
        <div className="user-menu-panel">
          <div className="user-menu-head">
            <div className="user-menu-email">{user.email ?? "Account"}</div>
          </div>
          <Link href="/billing" className="user-menu-item" onClick={() => setOpen(false)}>
            Account
          </Link>
          <Link href="/requests" className="user-menu-item" onClick={() => setOpen(false)}>
            Requests
          </Link>
          <Link href="/upgrade" className="user-menu-item" onClick={() => setOpen(false)}>
            Upgrade plan
          </Link>
          <button onClick={onLogout} className="user-menu-item danger" type="button">
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
