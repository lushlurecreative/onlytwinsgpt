import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

type PostRow = {
  creator_id: string;
  is_published: boolean;
  visibility: "public" | "subscribers";
  created_at: string;
};

type SubRow = {
  creator_id: string;
  status: string;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fromIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: posts, error: postsError }, { data: subs, error: subsError }] = await Promise.all([
    supabase
      .from("posts")
      .select("creator_id, is_published, visibility, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("subscriptions")
      .select("creator_id, status")
      .in("status", ["active", "trialing", "past_due", "canceled"])
      .limit(5000),
  ]);

  if (postsError) return NextResponse.json({ error: postsError.message }, { status: 400 });
  if (subsError) return NextResponse.json({ error: subsError.message }, { status: 400 });

  const postRows = (posts ?? []) as PostRow[];
  const subRows = (subs ?? []) as SubRow[];

  const byCreator = new Map<
    string,
    {
      totalPosts: number;
      publishedPosts: number;
      publicPosts: number;
      subscriberPosts: number;
      postsLast30d: number;
      activeLikeSubs: number;
      pastDueSubs: number;
    }
  >();

  for (const p of postRows) {
    const entry = byCreator.get(p.creator_id) ?? {
      totalPosts: 0,
      publishedPosts: 0,
      publicPosts: 0,
      subscriberPosts: 0,
      postsLast30d: 0,
      activeLikeSubs: 0,
      pastDueSubs: 0,
    };
    entry.totalPosts += 1;
    if (p.is_published) {
      entry.publishedPosts += 1;
      if (p.visibility === "public") entry.publicPosts += 1;
      if (p.visibility === "subscribers") entry.subscriberPosts += 1;
    }
    if (p.created_at >= fromIso) entry.postsLast30d += 1;
    byCreator.set(p.creator_id, entry);
  }

  for (const s of subRows) {
    const entry = byCreator.get(s.creator_id) ?? {
      totalPosts: 0,
      publishedPosts: 0,
      publicPosts: 0,
      subscriberPosts: 0,
      postsLast30d: 0,
      activeLikeSubs: 0,
      pastDueSubs: 0,
    };
    if (s.status === "active" || s.status === "trialing" || s.status === "past_due") {
      entry.activeLikeSubs += 1;
    }
    if (s.status === "past_due") entry.pastDueSubs += 1;
    byCreator.set(s.creator_id, entry);
  }

  const rows = [...byCreator.entries()]
    .map(([creatorId, v]) => ({
      creatorId,
      ...v,
      estMrr: Number((v.activeLikeSubs * 9.99).toFixed(2)),
    }))
    .sort((a, b) => b.estMrr - a.estMrr)
    .slice(0, 200);

  return NextResponse.json({ rows }, { status: 200 });
}

