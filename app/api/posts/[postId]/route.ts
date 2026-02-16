import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

const ALLOWED_VISIBILITY = new Set(["public", "subscribers"]);

type Params = {
  params: Promise<{ postId: string }>;
};

async function resolveActor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  request: Request
) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null as null, isAdmin: false, error: "Unauthorized" };
  }

  const adminHeader = request.headers.get("x-admin-override");
  const adminIds =
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const isAdmin = adminHeader === "1" && adminIds.includes(user.id);

  return { user, isAdmin, error: null as string | null };
}

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient();
  const actor = await resolveActor(supabase, request);
  if (actor.error || !actor.user) {
    return NextResponse.json({ error: actor.error ?? "Unauthorized" }, { status: 401 });
  }

  const { postId } = await params;
  if (!postId) {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }

  let body: {
    caption?: string | null;
    isPublished?: boolean;
    visibility?: "public" | "subscribers";
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: {
    caption?: string | null;
    is_published?: boolean;
    visibility?: "public" | "subscribers";
  } = {};
  if ("caption" in body) updates.caption = body.caption ?? null;
  if ("isPublished" in body) updates.is_published = !!body.isPublished;
  if ("visibility" in body) {
    if (!body.visibility || !ALLOWED_VISIBILITY.has(body.visibility)) {
      return NextResponse.json({ error: "Invalid visibility value" }, { status: 400 });
    }
    updates.visibility = body.visibility;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  let updateQuery = supabase.from("posts").update(updates).eq("id", postId);
  if (!actor.isAdmin) {
    updateQuery = updateQuery.eq("creator_id", actor.user.id);
  }

  const { data, error } = await updateQuery
    .select("id, caption, is_published, visibility")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ post: data }, { status: 200 });
}

export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const actor = await resolveActor(supabase, _request);
  if (actor.error || !actor.user) {
    return NextResponse.json({ error: actor.error ?? "Unauthorized" }, { status: 401 });
  }

  const { postId } = await params;
  if (!postId) {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }

  let postQuery = supabase.from("posts").select("storage_path").eq("id", postId);
  if (!actor.isAdmin) {
    postQuery = postQuery.eq("creator_id", actor.user.id);
  }

  const { data: post, error: postError } = await postQuery.single();

  if (postError || !post) {
    return NextResponse.json({ error: postError?.message ?? "Post not found" }, { status: 400 });
  }

  const { error: storageError } = await supabase
    .storage
    .from("uploads")
    .remove([post.storage_path]);

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 400 });
  }

  let deleteQuery = supabase.from("posts").delete().eq("id", postId);
  if (!actor.isAdmin) {
    deleteQuery = deleteQuery.eq("creator_id", actor.user.id);
  }

  const { error } = await deleteQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

