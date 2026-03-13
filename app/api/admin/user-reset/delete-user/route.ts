import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { deleteUserCompletely } from "@/lib/delete-user-cascade";

/** POST: Delete a single user completely by email. Admin only. Body: { email: string }. */
export async function POST(request: Request) {
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

  let body: { email?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const target = (userList?.users ?? []).find(
    (u) => (u.email ?? "").trim().toLowerCase() === email
  );
  if (!target) {
    return NextResponse.json({ error: "User not found for that email." }, { status: 404 });
  }

  if (target.id === user.id) {
    return NextResponse.json({ error: "Cannot delete your own account." }, { status: 403 });
  }

  const result = await deleteUserCompletely(
    admin,
    target.id,
    target.email ?? null,
    admin.auth.admin
  );
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, deletedUserId: target.id, email }, { status: 200 });
}
