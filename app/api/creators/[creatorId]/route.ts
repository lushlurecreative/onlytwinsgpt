import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

type Params = {
  params: Promise<{ creatorId: string }>;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function GET(_request: Request, { params }: Params) {
  const { creatorId } = await params;
  if (!creatorId || !isUuid(creatorId)) {
    return NextResponse.json({ error: "Valid creatorId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const [{ count: totalPosts }, { count: publicPublished }, { count: subscriberPublished }] =
    await Promise.all([
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", creatorId),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", creatorId)
        .eq("is_published", true)
        .eq("visibility", "public"),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", creatorId)
        .eq("is_published", true)
        .eq("visibility", "subscribers"),
    ]);

  return NextResponse.json(
    {
      creatorId,
      totalPosts: totalPosts ?? 0,
      publicPublished: publicPublished ?? 0,
      subscriberPublished: subscriberPublished ?? 0,
    },
    { status: 200 }
  );
}

