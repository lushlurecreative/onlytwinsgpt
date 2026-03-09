"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { MARKETING_MESSAGE_MAP } from "@/lib/marketing-message-map";

type AuthAwarePrimaryCtaProps = {
  className?: string;
};

export default function AuthAwarePrimaryCta({ className = "btn btn-primary" }: AuthAwarePrimaryCtaProps) {
  const supabase = useMemo(() => createClient(), []);
  const [hasUser, setHasUser] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setHasUser(!!data.user);
      setLoading(false);
    };

    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasUser(!!session?.user);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  if (loading) return null;

  if (hasUser) {
    return (
      <Link href="/dashboard" className={className}>
        Open Dashboard
      </Link>
    );
  }

  return (
    <Link href={MARKETING_MESSAGE_MAP.cta.primaryHref} className={className}>
      {MARKETING_MESSAGE_MAP.cta.primaryLabel}
    </Link>
  );
}
