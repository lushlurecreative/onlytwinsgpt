import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

type PublicFeedPostRow = {
  id: string;
  storage_path: string;
  caption: string | null;
  visibility: "public" | "subscribers";
  created_at: string;
};

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("posts")
    .select("id, storage_path, caption, visibility, created_at")
    .eq("is_published", true)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as PublicFeedPostRow[];
  const postsWithSignedUrl = await Promise.all(
    rows.map(async (post) => {
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

  return NextResponse.json({ posts: postsWithSignedUrl }, { status: 200 });
}

