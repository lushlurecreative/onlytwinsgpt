import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import AdminCustomersClient from "./AdminCustomersClient";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/customers");
  }
  if (!isAdminUser(user.id, user.email)) {
    return <p>❌ Access denied.</p>;
  }

  return <AdminCustomersClient />;
}
