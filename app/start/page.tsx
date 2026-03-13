import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function StartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && isAdminUser(user.id, user.email)) {
    redirect("/admin");
  }
  redirect("/dashboard");
}

