import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { hasActiveSubscription } from "@/lib/subscriptions";

type Params = {
  params: Promise<{ creatorId: string }>;
};

type FeedPostRow = {
  id: string;
  creator_id: string;
  storage_path: string;
  caption: string | null;
  visibility: "public" | "subscribers";
  created_at: string;
};

type LockedTeaserRow = {
  id: string;
  caption: string | null;
  created_at: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function GET(request: Request, { params }: Params) {
  const { creatorId } = await params;
  if (!creatorId) {
    return NextResponse.json({ error: "creatorId is required" }, { status: 400 });
  }
  if (!isUuid(creatorId)) {
    return NextResponse.json(
      {
        error:
          "Invalid creatorId. Use a real UUID, for example from /upload 'Creator feed test URL'.",
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const url = new URL(request.url);
  const forcePublicMode = url.searchParams.get("mode") === "public";
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let canSeeSubscriberPosts = false;
  if (!forcePublicMode && user?.id) {
    canSeeSubscriberPosts = await hasActiveSubscription(supabase, user.id, creatorId);
  }

  const { count: subscriberPostCount, error: countError } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("creator_id", creatorId)
    .eq("is_published", true)
    .eq("visibility", "subscribers");

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 });
  }

  const { data: lockedTeasers, error: teaserError } = await supabase
    .from("posts")
    .select("id, caption, created_at")
    .eq("creator_id", creatorId)
    .eq("is_published", true)
    .eq("visibility", "subscribers")
    .order("created_at", { ascending: false })
    .limit(6);

  if (teaserError) {
    return NextResponse.json({ error: teaserError.message }, { status: 400 });
  }

  let query = supabase
    .from("posts")
    .select("id, creator_id, storage_path, caption, visibility, created_at")
    .eq("creator_id", creatorId)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!canSeeSubscriberPosts) {
    query = query.eq("visibility", "public");
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const postsWithSignedUrl = await Promise.all(
    ((data ?? []) as FeedPostRow[]).map(async (post) => {
      const { data: signedData } = await supabase
        .storage
        .from("uploads")
        .createSignedUrl(post.storage_path, 60);

      return {
        ...post,
        signed_url: signedData?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json(
    {
      posts: postsWithSignedUrl,
      subscriberAccess: canSeeSubscriberPosts,
      viewerMode: forcePublicMode ? "public" : "normal",
      lockedSubscriberPostCount: canSeeSubscriberPosts ? 0 : subscriberPostCount ?? 0,
      lockedTeasers: canSeeSubscriberPosts
        ? []
        : ((lockedTeasers ?? []) as LockedTeaserRow[]).map((t) => ({
            id: t.id,
            caption: t.caption,
            created_at: t.created_at,
          })),
    },
    { status: 200 }
  );
}

