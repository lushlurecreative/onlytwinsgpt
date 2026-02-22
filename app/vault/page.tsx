import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getUserRole, isSuspended } from "@/lib/roles";
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

  const role = await getUserRole(supabase, user.id);
  if (role !== "creator") {
    redirect("/onboarding/creator?from=vault");
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <VaultClient userId={user.id} />
    </main>
  );
}

