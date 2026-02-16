import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import AdminLeadsClient from "./AdminLeadsClient";

export default async function AdminLeadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirectTo=/admin/leads");
  }
  if (!isAdminUser(user.id)) {
    return <p>❌ Access denied. Add your user ID to ADMIN_USER_IDS.</p>;
  }
  return <AdminLeadsClient />;
}

