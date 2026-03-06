import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getEntitlements } from "@/lib/entitlements";

export async function requireActiveSubscriber(redirectPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectPath)}`);
  }

  const entitlements = await getEntitlements(supabase, user.id);
  if (!entitlements.isSubscriber) {
    redirect("/pricing");
  }

  return { supabase, user, entitlements };
}
