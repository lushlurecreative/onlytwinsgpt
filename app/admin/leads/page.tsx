import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import AdminLeadsClient from "./AdminLeadsClient";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirectTo=/admin/leads");
  }
  if (!isAdminUser(user.id, user.email)) {
    redirect("/dashboard?unauthorized=admin");
  }
  return <AdminLeadsClient initialSessionEmail={user.email ?? null} initialIsAdmin={true} />;
}

