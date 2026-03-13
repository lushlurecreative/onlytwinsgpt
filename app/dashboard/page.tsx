import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import DashboardClient from "@/app/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/dashboard");
  }

  if (isAdminUser(user.id, user.email)) {
    redirect("/admin");
  }

  await requireActiveSubscriber("/dashboard");
  return <DashboardClient />;
}
