import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const session = await createClient();
  const {
    data: { user },
    error: userError,
  } = await session.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from("uploads").createSignedUrl(path.trim(), 60 * 60);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data?.signedUrl) {
    return NextResponse.json({ error: "Could not create signed URL" }, { status: 400 });
  }

  return NextResponse.redirect(data.signedUrl);
}
