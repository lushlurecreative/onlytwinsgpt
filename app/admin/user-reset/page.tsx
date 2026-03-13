import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import AdminUserResetClient from "./AdminUserResetClient";

export const dynamic = "force-dynamic";

export default async function AdminUserResetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/admin/user-reset");
  if (!isAdminUser(user.id, user.email)) redirect("/dashboard?unauthorized=admin");

  return (
    <div>
      <h1 style={{ marginTop: 0, marginBottom: 8 }}>User reset tools</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>
        Danger zone: permanently remove test users and their data. Admin only.
      </p>
      <AdminUserResetClient />
    </div>
  );
}
