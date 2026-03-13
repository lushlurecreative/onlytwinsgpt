import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { getServiceCreatorId } from "@/lib/service-creator";

type Params = { params: Promise<{ userId: string }> };

/**
 * DELETE: Permanently remove an auth account (and its profile).
 * Used for "Recent accounts" signups that are not customers.
 * Admin only. Cannot delete self. Cannot delete converted customers (use customer Archive).
 */
export async function DELETE(_request: Request, { params }: Params) {
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

  if (userId === user.id) {
    return NextResponse.json({ error: "Cannot delete your own account." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const serviceCreatorId = getServiceCreatorId();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("creator_id", serviceCreatorId)
    .eq("subscriber_id", userId)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (sub) {
    return NextResponse.json(
      { error: "This account is a customer. Use Archive in the customers section instead." },
      { status: 400 }
    );
  }

  await admin.from("profiles").delete().eq("id", userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, deletedUserId: userId }, { status: 200 });
}
