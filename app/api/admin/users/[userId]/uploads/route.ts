import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Params = { params: Promise<{ userId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id, user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data: files, error } = await admin.storage.from("uploads").list(userId, {
    limit: 100,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const imageFiles = (files ?? [])
    .filter((f) => f.name && /\.(jpg|jpeg|png|webp|heic)$/i.test(f.name))
    .map((f) => ({
      path: `${userId}/${f.name}`,
      name: f.name,
      size: f.metadata?.size ?? null,
      created_at: f.created_at ?? null,
    }));

  return NextResponse.json({ files: imageFiles });
}
