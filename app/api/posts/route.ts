import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

const ALLOWED_VISIBILITY = new Set(["public", "subscribers"]);

type CreatorPostRow = {
  id: string;
  storage_path: string;
  caption: string | null;
  is_published: boolean;
  visibility: "public" | "subscribers";
  created_at: string;
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

  const { data, error } = await supabase
    .from("posts")
    .select("id, storage_path, caption, is_published, visibility, created_at")
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as CreatorPostRow[];
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

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    storagePath?: string;
    caption?: string | null;
    visibility?: "public" | "subscribers";
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const storagePath = body.storagePath?.trim();
  if (!storagePath) {
    return NextResponse.json({ error: "storagePath is required" }, { status: 400 });
  }

  if (!storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid storagePath for current user" }, { status: 403 });
  }

  const visibility = body.visibility ?? "public";
  if (!ALLOWED_VISIBILITY.has(visibility)) {
    return NextResponse.json({ error: "Invalid visibility value" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      creator_id: user.id,
      storage_path: storagePath,
      caption: body.caption ?? null,
      visibility,
    })
    .select("id, storage_path")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ postId: data.id, storagePath: data.storage_path }, { status: 201 });
}

