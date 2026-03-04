"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getEntitlements } from "@/lib/entitlements";

export default function HeaderSubscriptionCta() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [hasUser, setHasUser] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!active) return;

      if (!user) {
        setHasUser(false);
        setIsSubscriber(false);
        setLoading(false);
        return;
      }

      setHasUser(true);
      const entitlements = await getEntitlements(supabase, user.id);
      if (!active) return;
      setIsSubscriber(entitlements.isSubscriber);
      setLoading(false);
    };

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  if (loading) return null;

  if (hasUser && isSubscriber) {
    return (
      <Link href="/billing" className="nav-link">
        Account
      </Link>
    );
  }

  return (
    <Link href="/pricing" className="btn btn-primary">
      Start Subscription
    </Link>
  );
}
