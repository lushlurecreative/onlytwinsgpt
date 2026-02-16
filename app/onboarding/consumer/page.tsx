import Link from "next/link";
import { createClient } from "@/lib/supabase-server";

export default async function ConsumerOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: subscriptions } = user
    ? await supabase
        .from("subscriptions")
        .select("status")
        .eq("subscriber_id", user.id)
        .in("status", ["active", "trialing", "past_due"])
        .limit(100)
    : { data: [] as { status: string }[] };

  const active = (subscriptions ?? []).filter((s) => s.status === "active").length;
  const trialing = (subscriptions ?? []).filter((s) => s.status === "trialing").length;
  const pastDue = (subscriptions ?? []).filter((s) => s.status === "past_due").length;
  const hasAnySubscription = active + trialing + pastDue > 0;

  return (
    <main style={{ padding: 24, maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Consumer Onboarding</h1>
      <p>Start here to discover creators and unlock premium content.</p>
      <ol>
        <li style={{ marginBottom: 10 }}>
          {user ? "✅" : "⬜"} {user ? "Signed in." : "Create an account or sign in."}{" "}
          {!user ? <Link href="/login">Go to login</Link> : null}
        </li>
        <li style={{ marginBottom: 10 }}>
          ⬜ Browse creators from <Link href="/creators">Creators Directory</Link>.
        </li>
        <li style={{ marginBottom: 10 }}>
          ⬜ Open a creator profile and preview public posts.
        </li>
        <li style={{ marginBottom: 10 }}>
          ⬜ Open a creator feed and subscribe to unlock private drops.
        </li>
        <li style={{ marginBottom: 10 }}>
          ⬜ Track your active plans in <Link href="/billing">Billing</Link>.
          {user ? (
            <span style={{ marginLeft: 8 }}>
              {hasAnySubscription ? "✅" : "⬜"} Active/trialing/past due:{" "}
              <strong>{active + trialing + pastDue}</strong>
            </span>
          ) : null}
        </li>
      </ol>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <Link href="/creators">Browse Creators</Link>
        <Link href="/feed">Public Feed</Link>
        <Link href="/billing">Billing</Link>
      </div>
    </main>
  );
}

