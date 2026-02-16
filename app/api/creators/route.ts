import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

type CreatorRow = {
  creatorId: string;
  postCount: number;
};

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("posts")
    .select("creator_id")
    .eq("is_published", true)
    .eq("visibility", "public")
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const creatorId = (row as { creator_id?: string }).creator_id;
    if (!creatorId) continue;
    counts.set(creatorId, (counts.get(creatorId) ?? 0) + 1);
  }

  const creators: CreatorRow[] = [...counts.entries()]
    .map(([creatorId, postCount]) => ({ creatorId, postCount }))
    .sort((a, b) => b.postCount - a.postCount);

  return NextResponse.json({ creators }, { status: 200 });
}

