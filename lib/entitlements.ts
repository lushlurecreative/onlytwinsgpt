import type { SupabaseClient } from "@supabase/supabase-js";

export type Entitlements = {
  isSubscriber: boolean;
  isCreator: boolean;
};

export async function getEntitlements(
  supabase: SupabaseClient,
  userId: string
): Promise<Entitlements> {
  let isSubscriber = false;
  let isCreator = false;

  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("subscriber_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.status) {
      isSubscriber = ["active", "trialing"].includes(String(data.status));
    }
  } catch {}

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("role, is_creator, subscription_status")
      .eq("id", userId)
      .maybeSingle();

    if (!error && data) {
      const role = typeof data.role === "string" ? data.role.trim().toLowerCase() : "";
      isCreator = role === "creator" || Boolean((data as { is_creator?: unknown }).is_creator);

      const subscriptionStatus = (data as { subscription_status?: unknown }).subscription_status;
      if (subscriptionStatus && !isSubscriber) {
        isSubscriber = ["active", "trialing"].includes(String(subscriptionStatus));
      }
    }
  } catch {}

  return { isSubscriber, isCreator };
}
