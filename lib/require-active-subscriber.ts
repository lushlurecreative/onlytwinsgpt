import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cookies } from "next/headers";
import { getStripe } from "@/lib/stripe";

function mapStripeStatus(status: string | null | undefined) {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "trialing") return "trialing";
  if (normalized === "past_due" || normalized === "unpaid") return "past_due";
  if (normalized === "canceled") return "canceled";
  return "expired";
}

function extractStripeCustomerId(customer: unknown): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if (
    typeof customer === "object" &&
    customer !== null &&
    "id" in customer &&
    typeof (customer as { id?: unknown }).id === "string"
  ) {
    return (customer as { id: string }).id;
  }
  return null;
}

function extractStripeSubscriptionId(subscription: unknown): string | null {
  if (!subscription) return null;
  if (typeof subscription === "string") return subscription;
  if (
    typeof subscription === "object" &&
    subscription !== null &&
    "id" in subscription &&
    typeof (subscription as { id?: unknown }).id === "string"
  ) {
    return (subscription as { id: string }).id;
  }
  return null;
}

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

  let finalIsSubscriber = isSubscriberFromSubscriptions || !!profileStripeCustomerId;

  // Self-heal: if logged-in user has no active entitlement, reconcile from
  // checkout sid cookie and transfer Stripe linkage/subscription to this auth user.
  if (!finalIsSubscriber) {
    try {
      const cookieStore = await cookies();
      const checkoutSid = cookieStore.get("ot_checkout_sid")?.value?.trim() ?? "";
      if (checkoutSid) {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(checkoutSid, {
          expand: ["customer", "subscription"],
        });
        const stripeCustomerId = extractStripeCustomerId(session.customer);
        const stripeSubscriptionId = extractStripeSubscriptionId(session.subscription);

        if (stripeCustomerId) {
          const { data: profileByCustomer } = await admin
            .from("profiles")
            .select("id")
            .eq("stripe_customer_id", stripeCustomerId)
            .maybeSingle();
          const existingOwnerId = (profileByCustomer as { id?: string | null } | null)?.id ?? null;

          if (existingOwnerId && existingOwnerId !== user.id) {
            await admin
              .from("subscriptions")
              .update({ subscriber_id: user.id })
              .eq("subscriber_id", existingOwnerId);

            await admin
              .from("profiles")
              .update({ stripe_customer_id: null, updated_at: new Date().toISOString() })
              .eq("id", existingOwnerId)
              .eq("stripe_customer_id", stripeCustomerId);
          }

          await admin.from("profiles").upsert(
            {
              id: user.id,
              stripe_customer_id: stripeCustomerId,
              onboarding_pending: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        }

        if (stripeSubscriptionId) {
          const stripeSubscription =
            session.subscription && typeof session.subscription === "object" && "status" in session.subscription
              ? (session.subscription as { status?: string })
              : await stripe.subscriptions.retrieve(stripeSubscriptionId);

          await admin
            .from("subscriptions")
            .update({
              subscriber_id: user.id,
              status: mapStripeStatus((stripeSubscription as { status?: string }).status ?? null),
            })
            .eq("stripe_subscription_id", stripeSubscriptionId);
        }

        const { data: rowsAfter } = await admin
          .from("subscriptions")
          .select("id, status")
          .eq("subscriber_id", user.id)
          .limit(25);
        const normalizedRows = (rowsAfter ?? []) as Array<{ id?: string; status?: string | null }>;
        finalIsSubscriber =
          normalizedRows.some((row) => {
            const status = (row.status ?? "").toLowerCase();
            return status === "active" || status === "trialing";
          }) ||
          !!stripeCustomerId;
      }
    } catch (reconcileError) {
      console.log("[start-gating-debug-reconcile-error]", {
        userId: user.id,
        message: reconcileError instanceof Error ? reconcileError.message : String(reconcileError),
      });
    }
  }

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
