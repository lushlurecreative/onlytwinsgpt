import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditLog } from "@/lib/audit-log";

type Params = { params: Promise<{ userId: string }> };

/** PATCH: Suspend or unsuspend a user. Body: { suspended: boolean }. Admin only. */
export async function PATCH(request: Request, { params }: Params) {
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

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  let body: { suspended?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const suspended = body.suspended === true;
  const admin = getSupabaseAdmin();
  const { data: before } = await admin
    .from("profiles")
    .select("id, suspended_at")
    .eq("id", userId)
    .maybeSingle();
  const { error } = await admin
    .from("profiles")
    .update({ suspended_at: suspended ? new Date().toISOString() : null })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await writeAuditLog(admin, {
    actor: user.id,
    actionType: suspended ? "admin.user.suspend" : "admin.user.unsuspend",
    entityRef: `user:${userId}`,
    beforeJson: before ?? null,
    afterJson: { suspended_at: suspended ? "set" : null },
  });
  return NextResponse.json({ ok: true, suspended });
}
