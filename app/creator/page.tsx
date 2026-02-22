/* eslint-disable react-hooks/purity */

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getUserRole, isSuspended } from "@/lib/roles";

export default async function CreatorDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/creator");
  }

  if (await isSuspended(supabase, user.id)) {
    redirect("/suspended");
  }

  const role = await getUserRole(supabase, user.id);
  if (role !== "creator") {
    redirect("/onboarding/creator?from=creator");
  }

  const [{ count: totalPosts }, { count: publishedPosts }, { count: subscriberOnlyPosts }] =
    await Promise.all([
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", user.id),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", user.id)
        .eq("is_published", true),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", user.id)
        .eq("visibility", "subscribers"),
    ]);

  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [
    { count: recentPosts },
    { count: publicPublishedPosts },
    { count: activeSubscribers },
    recentTrendQuery,
  ] =
    await Promise.all([
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", user.id)
        .gte("created_at", sevenDaysAgoIso),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", user.id)
        .eq("is_published", true)
        .eq("visibility", "public"),
      supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", user.id)
        .in("status", ["active", "trialing"]),
      supabase
        .from("posts")
        .select("created_at")
        .eq("creator_id", user.id)
        .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: true }),
    ]);

  const publishRate =
    (totalPosts ?? 0) > 0 ? Math.round(((publishedPosts ?? 0) / (totalPosts ?? 1)) * 100) : 0;
  const estimatedMrr = (activeSubscribers ?? 0) * 9.99;
  const trendSource = recentTrendQuery.data ?? [];
  const trendBuckets = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    return { key, count: 0 };
  });
  for (const row of trendSource) {
    const key = row.created_at.slice(0, 10);
    const bucket = trendBuckets.find((b) => b.key === key);
    if (bucket) bucket.count += 1;
  }
  const maxTrend = Math.max(1, ...trendBuckets.map((b) => b.count));

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Creator Dashboard</h1>
      <p>Manage uploads, publishing, and audience access from one place.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <article style={{ border: "1px solid #333", borderRadius: 8, padding: 12 }}>
          <div style={{ opacity: 0.8 }}>Total Posts</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{totalPosts ?? 0}</div>
        </article>
        <article style={{ border: "1px solid #333", borderRadius: 8, padding: 12 }}>
          <div style={{ opacity: 0.8 }}>Published</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{publishedPosts ?? 0}</div>
        </article>
        <article style={{ border: "1px solid #333", borderRadius: 8, padding: 12 }}>
          <div style={{ opacity: 0.8 }}>Subscriber-only</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{subscriberOnlyPosts ?? 0}</div>
        </article>
        <article style={{ border: "1px solid #333", borderRadius: 8, padding: 12 }}>
          <div style={{ opacity: 0.8 }}>New in 7 days</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{recentPosts ?? 0}</div>
        </article>
        <article style={{ border: "1px solid #333", borderRadius: 8, padding: 12 }}>
          <div style={{ opacity: 0.8 }}>Publish rate</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{publishRate}%</div>
        </article>
        <article style={{ border: "1px solid #333", borderRadius: 8, padding: 12 }}>
          <div style={{ opacity: 0.8 }}>Public published</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{publicPublishedPosts ?? 0}</div>
        </article>
        <article style={{ border: "1px solid #333", borderRadius: 8, padding: 12 }}>
          <div style={{ opacity: 0.8 }}>Active subscribers</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{activeSubscribers ?? 0}</div>
        </article>
        <article style={{ border: "1px solid #333", borderRadius: 8, padding: 12 }}>
          <div style={{ opacity: 0.8 }}>Est. monthly revenue</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>${estimatedMrr.toFixed(2)}</div>
        </article>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Link href="/vault">Open Vault (uploads &amp; generation)</Link>
        <Link href={`/feed/creator/${user.id}`}>Open Creator Feed View</Link>
        <Link href="/billing">Billing &amp; subscribers</Link>
        <Link href="/start">My subscriptions</Link>
        <Link href="/onboarding/creator">Onboarding checklist</Link>
        <Link href="/feed">Open Public Feed</Link>
      </div>

      <section style={{ marginTop: 20 }}>
        <h2 style={{ marginBottom: 8 }}>14-Day Publishing Trend</h2>
        <div style={{ display: "grid", gap: 6 }}>
          {trendBuckets.map((bucket) => (
            <div key={bucket.key} style={{ display: "grid", gridTemplateColumns: "86px 1fr 28px", gap: 8 }}>
              <div style={{ opacity: 0.8 }}>{bucket.key.slice(5)}</div>
              <div style={{ background: "#1f2434", borderRadius: 6, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.round((bucket.count / maxTrend) * 100)}%`,
                    minWidth: bucket.count > 0 ? 8 : 0,
                    height: 12,
                    background: "linear-gradient(90deg, #8a7dff, #5fe3ff)",
                  }}
                />
              </div>
              <div>{bucket.count}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

