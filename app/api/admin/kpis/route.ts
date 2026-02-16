import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

function dateKey(dateIso: string) {
  return dateIso.slice(0, 10);
}

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
      .select("id, is_published, created_at")
      .gte("created_at", fromIso)
      .order("created_at", { ascending: true }),
    supabase
      .from("subscriptions")
      .select("id, status, created_at")
      .gte("created_at", fromIso)
      .order("created_at", { ascending: true }),
  ]);

  if (postsError) return NextResponse.json({ error: postsError.message }, { status: 400 });
  if (subsError) return NextResponse.json({ error: subsError.message }, { status: 400 });

  const dayMap = new Map<
    string,
    { newPosts: number; newPublishedPosts: number; newSubscriptions: number; newPastDue: number }
  >();

  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dayMap.set(d, { newPosts: 0, newPublishedPosts: 0, newSubscriptions: 0, newPastDue: 0 });
  }

  for (const post of posts ?? []) {
    const key = dateKey(post.created_at);
    const row = dayMap.get(key);
    if (!row) continue;
    row.newPosts += 1;
    if (post.is_published) row.newPublishedPosts += 1;
  }
  for (const sub of subs ?? []) {
    const key = dateKey(sub.created_at);
    const row = dayMap.get(key);
    if (!row) continue;
    row.newSubscriptions += 1;
    if (sub.status === "past_due") row.newPastDue += 1;
  }

  const daily = [...dayMap.entries()].map(([date, v]) => ({ date, ...v }));
  return NextResponse.json({ daily }, { status: 200 });
}

