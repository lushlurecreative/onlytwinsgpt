"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export default function PrimaryNav() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setUser(data.user ?? null);
      setLoading(false);
    };

    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  if (loading) {
    return null;
  }

  if (user) {
    return (
      <>
        <Link href="/dashboard" className="nav-link">
          Dashboard
        </Link>
        <Link href="/gallery" className="nav-link">
          Gallery
        </Link>
        <Link href="/results" className="nav-link">
          Results
        </Link>
        <Link href="/status" className="nav-link">
          Status
        </Link>
        <Link href="/billing" className="nav-link">
          Account
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/how-it-works" className="nav-link">
        How It Works
      </Link>
      <Link href="/results" className="nav-link">
        Results
      </Link>
      <Link href="/gallery" className="nav-link">
        Gallery
      </Link>
      <Link href="/pricing" className="nav-link">
        Pricing
      </Link>
      <Link href="/about" className="nav-link">
        About
      </Link>
      <Link href="/faq" className="nav-link">
        FAQ
      </Link>
      <Link href="/contact" className="nav-link">
        Contact
      </Link>
    </>
  );
}
