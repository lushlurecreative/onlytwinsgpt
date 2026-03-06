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

  let subscriptionRows: Array<{ id?: string; status?: string | null }> = [];
  let subscriptionQueryError: string | null = null;
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id, status, created_at")
      .eq("subscriber_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      subscriptionQueryError = error.message;
    } else {
      subscriptionRows = (data ?? []) as Array<{ id?: string; status?: string | null }>;
    }
  } catch (error) {
    subscriptionQueryError = error instanceof Error ? error.message : String(error);
  }

  const entitlements = await getEntitlements(supabase, user.id);
  // TEMP DEBUG LOG: keep for diagnosing paid-user gating decisions.
  console.log("[start-gating-debug]", {
    userId: user.id,
    subscriptionRowFound: subscriptionRows.length > 0,
    subscriptionStatusValues: subscriptionRows.map((row) => row.status ?? null),
    finalIsSubscriber: entitlements.isSubscriber,
    subscriptionQueryError,
  });

  if (!entitlements.isSubscriber) {
    redirect("/pricing");
  }

  return { supabase, user, entitlements };
}
