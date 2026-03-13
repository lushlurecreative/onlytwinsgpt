import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { deleteUserCompletely, isProtectedAdminEmail } from "@/lib/delete-user-cascade";

const CONFIRM_TEXT = "DELETE ALL TEST USERS";

/** POST: Delete all non-admin users and their data. Body: { confirmText: string }. Admin only. */
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

  let body: { confirmText?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if ((body.confirmText ?? "").trim() !== CONFIRM_TEXT) {
    return NextResponse.json(
      { error: `Confirmation text must be exactly: ${CONFIRM_TEXT}` },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const toDelete = (userList?.users ?? []).filter(
    (u) => !isProtectedAdminEmail(u.email ?? null) && u.id !== user.id
  );

  const deleted: string[] = [];
  const errors: string[] = [];
  for (const u of toDelete) {
    const result = await deleteUserCompletely(
      admin,
      u.id,
      u.email ?? null,
      admin.auth.admin
    );
    if ("error" in result) {
      errors.push(`${u.email ?? u.id}: ${result.error}`);
    } else {
      deleted.push(u.email ?? u.id);
    }
  }

  return NextResponse.json(
    { ok: true, deletedCount: deleted.length, deleted, errors },
    { status: 200 }
  );
}
