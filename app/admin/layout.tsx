import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import AdminNav from "./AdminNav";
import AdminGlobalHealth from "./AdminGlobalHealth";
import BrandName from "@/app/components/BrandName";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin");
  }
  if (!isAdminUser(user.id)) {
    return (
      <section className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <BrandName /> Admin
          </div>
        </aside>
        <div className="admin-content">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Access denied</h2>
            <p className="muted">Add your user ID to `ADMIN_USER_IDS`.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <BrandName /> Admin
        </div>
        <AdminNav />
      </aside>
      <div className="admin-content">
        <AdminGlobalHealth />
        {children}
      </div>
    </section>
  );
}
