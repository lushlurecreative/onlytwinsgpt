import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { getServiceCreatorId } from "@/lib/service-creator";

/** GET: List all auth users with profile and paid-customer flag. Admin only. */
export async function GET() {
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
  const serviceCreatorId = getServiceCreatorId();

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authUsers = list?.users ?? [];

  const { data: subRows } = await admin
    .from("subscriptions")
    .select("subscriber_id")
    .eq("creator_id", serviceCreatorId)
    .is("archived_at", null);
  const paidSubscriberIds = new Set((subRows ?? []).map((r) => (r as { subscriber_id: string }).subscriber_id));

  const adminEmails = new Set(
    (process.env.ADMIN_OWNER_EMAILS ?? "lush.lure.creative@gmail.com")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );

  const users = authUsers.map((u) => {
    const id = u.id;
    const email = (u.email ?? "").trim().toLowerCase();
    const isAdmin = !!email && adminEmails.has(email);
    const isPaidCustomer = paidSubscriberIds.has(id);
    return {
      id,
      email: u.email ?? null,
      createdAt: u.created_at ?? null,
      isAdmin,
      isPaidCustomer,
    };
  });

  return NextResponse.json({ users }, { status: 200 });
}
