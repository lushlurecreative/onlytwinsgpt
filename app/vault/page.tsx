import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import VaultClient from "./VaultClient";

export default async function VaultPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/vault");
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <VaultClient userId={user.id} />
    </main>
  );
}

