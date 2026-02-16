import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import AdminGenerationRequestsClient from "./AdminGenerationRequestsClient";

export default async function AdminGenerationRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirectTo=/admin/generation-requests");
  }
  if (!isAdminUser(user.id)) {
    return <p>❌ Access denied. Add your user ID to ADMIN_USER_IDS.</p>;
  }

  return (
    <section>
      <AdminGenerationRequestsClient />
    </section>
  );
}

