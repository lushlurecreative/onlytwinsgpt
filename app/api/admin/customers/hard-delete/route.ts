import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { deleteUserCompletely } from "@/lib/delete-user-cascade";

export async function DELETE(request: Request) {
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

  const body = (await request.json().catch(() => ({}))) as {
    workspaceId?: string;
    confirmText?: string;
    userEmail?: string;
  };

  const { workspaceId, confirmText, userEmail } = body;

  if ((confirmText ?? "").trim().toUpperCase() !== "DELETE") {
    return NextResponse.json({ error: "Confirmation text DELETE is required." }, { status: 400 });
  }
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required." }, { status: 400 });
  }
  if (workspaceId === user.id) {
    return NextResponse.json({ error: "Cannot delete your own account." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const result = await deleteUserCompletely(admin, workspaceId, userEmail ?? null, {
    deleteUser: (id) => admin.auth.admin.deleteUser(id),
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, deletedUserId: workspaceId }, { status: 200 });
}
