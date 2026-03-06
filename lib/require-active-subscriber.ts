import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function requireActiveSubscriber(redirectPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectPath)}`);
  }

  const admin = getSupabaseAdmin();
  let subscriptionRows: Array<{ id?: string; status?: string | null; created_at?: string | null }> = [];
  let subscriptionQueryError: string | null = null;
  try {
    const { data, error } = await admin
      .from("subscriptions")
      .select("id, status, created_at")
      .eq("subscriber_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) {
      subscriptionQueryError = error.message;
    } else {
      subscriptionRows = (data ?? []) as Array<{
        id?: string;
        status?: string | null;
        created_at?: string | null;
      }>;
    }
  } catch (error) {
    subscriptionQueryError = error instanceof Error ? error.message : String(error);
  }

  const isSubscriberFromSubscriptions = subscriptionRows.some((row) => {
    const status = (row.status ?? "").toLowerCase();
    return status === "active" || status === "trialing";
  });

  // Fallback for post-checkout race window: profile exists and is linked to Stripe
  // while subscription webhook is still finalizing.
  let profileStripeCustomerId: string | null = null;
  if (!isSubscriberFromSubscriptions) {
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    const profileRow = profile as { stripe_customer_id?: string | null } | null;
    profileStripeCustomerId = profileRow?.stripe_customer_id ?? null;
  }

  const finalIsSubscriber = isSubscriberFromSubscriptions || !!profileStripeCustomerId;

  // TEMP DEBUG LOG: keep for diagnosing paid-user gating decisions.
  console.log("[start-gating-debug]", {
    userId: user.id,
    subscriptionRowFound: subscriptionRows.length > 0,
    subscriptionStatusValues: subscriptionRows.map((row) => row.status ?? null),
    profileStripeCustomerIdFound: !!profileStripeCustomerId,
    finalIsSubscriber,
    subscriptionQueryError,
  });

  if (!finalIsSubscriber) {
    redirect("/pricing");
  }

  return { supabase, user, entitlements: { isSubscriber: finalIsSubscriber, isCreator: false } };
}
