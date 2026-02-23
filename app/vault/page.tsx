import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getUserRole, isSuspended, setUserRole } from "@/lib/roles";
import VaultClient from "./VaultClient";

export default async function VaultPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/vault");
  }

  if (await isSuspended(supabase, user.id)) {
    redirect("/suspended");
  }

  let role = await getUserRole(supabase, user.id);
  if (role !== "creator") {
    // Allow subscribers with an active subscription to use the vault (set them as creator).
    const { count } = await supabase
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("subscriber_id", user.id)
      .in("status", ["active", "trialing", "past_due"]);
    if ((count ?? 0) > 0) {
      await setUserRole(supabase, user.id, "creator");
      role = "creator";
    }
  }
  if (role !== "creator") {
    redirect("/onboarding/creator?from=vault");
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <VaultClient userId={user.id} />
    </main>
  );
}

