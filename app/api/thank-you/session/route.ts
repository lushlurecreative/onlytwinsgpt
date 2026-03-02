import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { logError, logInfo, logWarn } from "@/lib/observability";
import { getServiceCreatorId } from "@/lib/service-creator";
import { cookies } from "next/headers";

function extractStripeCustomerId(
  customer: Stripe.Checkout.Session["customer"] | Stripe.Subscription["customer"] | null | undefined
) {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if (typeof customer === "object" && "id" in customer && typeof customer.id === "string") {
    return customer.id;
  }
  return null;
}

function extractStripeSubscriptionId(subscription: Stripe.Checkout.Session["subscription"] | null | undefined) {
  if (!subscription) return null;
  if (typeof subscription === "string") return subscription;
  if (typeof subscription === "object" && "id" in subscription && typeof subscription.id === "string") {
    return subscription.id;
  }
  return null;
}

function mapStripeStatus(status: Stripe.Subscription.Status) {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return "expired";
  }
}

function toIsoOrNull(unixSeconds: number | null | undefined) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { searchParams } = new URL(request.url);
    const sidFromQuery = searchParams.get("sid")?.trim() ?? "";
    const sidLegacy = searchParams.get("session_id")?.trim() ?? "";
    const cookieStore = await cookies();
    const sidFromCookie = cookieStore.get("ot_checkout_sid")?.value?.trim() ?? "";
    const sessionId = sidFromQuery || sidFromCookie || sidLegacy;
    if (!sessionId) {
      logWarn("thank_you_session_missing_session_id", { requestId });
      return NextResponse.json(
        { state: "error", error: "Missing checkout session id", reason: "sid_missing", request_id: requestId },
        { status: 400 }
      );
    }

    logInfo("thank_you_session_requested", { requestId, sessionId });
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer", "subscription"],
    });
    const paid =
      session.payment_status === "paid" ||
      session.status === "complete";
    if (!paid) {
      logWarn("thank_you_session_not_paid", {
        requestId,
        sessionId,
        payment_status: session.payment_status ?? null,
        session_status: session.status ?? null,
      });
      return NextResponse.json(
        {
          state: "processing",
          error: "Payment is still processing",
          reason: "payment_not_ready",
          request_id: requestId,
          session_id: sessionId,
          payment_status: session.payment_status ?? null,
          stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
          stripe_subscription_id:
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription && typeof session.subscription === "object" && "id" in session.subscription
                ? session.subscription.id
                : null,
        },
        { status: 200 }
      );
    }
    const stripeSubscriptionId = extractStripeSubscriptionId(session.subscription);
    if (session.mode === "subscription" && !stripeSubscriptionId) {
      logWarn("thank_you_session_subscription_missing", {
        requestId,
        sessionId,
        session_mode: session.mode,
      });
      return NextResponse.json(
        {
          state: "error",
          error: "Missing Stripe subscription id for subscription checkout.",
          reason: "stripe_subscription_missing",
          request_id: requestId,
          session_id: sessionId,
          payment_status: session.payment_status ?? null,
          stripe_customer_id: extractStripeCustomerId(session.customer),
          stripe_subscription_id: null,
        },
        { status: 400 }
      );
    }
    let stripeCustomerId = extractStripeCustomerId(session.customer);
    let subscriptionForResolution: Stripe.Subscription | null = null;
    if (!stripeCustomerId && stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        subscriptionForResolution = sub;
        stripeCustomerId = extractStripeCustomerId(sub.customer);
      } catch (resolutionError) {
        logWarn("thank_you_session_subscription_lookup_failed", {
          requestId,
          sessionId,
          stripe_subscription_id: stripeSubscriptionId,
          message:
            resolutionError instanceof Error
              ? resolutionError.message
              : String(resolutionError),
        });
      }
    }
    if (!stripeCustomerId) {
      logWarn("thank_you_session_customer_unresolvable", {
        requestId,
        sessionId,
        session_customer_type: typeof session.customer,
        stripe_subscription_id: stripeSubscriptionId,
      });
      return NextResponse.json(
        {
          state: "error",
          error: "Could not resolve Stripe customer id for this session.",
          request_id: requestId,
          session_id: sessionId,
          payment_status: session.payment_status ?? null,
          stripe_customer_id: null,
          stripe_subscription_id: stripeSubscriptionId,
          reason: "stripe_customer_unresolvable",
          diagnostics: {
            session_customer_type: typeof session.customer,
            has_subscription_id: !!stripeSubscriptionId,
            sid_source: sidFromQuery
              ? "query"
              : sidFromCookie
                ? "cookie"
                : sidLegacy
                  ? "legacy_query"
                  : "none",
          },
        },
        { status: 400 }
      );
    }
    const email =
      (session.customer_details?.email ??
        session.customer_email ??
        (session.customer &&
        typeof session.customer === "object" &&
        "email" in session.customer
          ? session.customer.email
          : null) ??
        null)?.trim().toLowerCase() ?? null;
    if (!email) {
      logWarn("thank_you_session_missing_email", {
        requestId,
        sessionId,
      });
      return NextResponse.json(
        {
          state: "error",
          error: "Missing checkout email",
          request_id: requestId,
          session_id: sessionId,
          payment_status: session.payment_status ?? null,
        },
        { status: 400 }
      );
    }

    // Paid sessions are ready for auth immediately.
    // Any profile/subscription self-heal runs server-side and never blocks UI readiness.
    const admin = getSupabaseAdmin();
    void (async () => {
      try {
        const { data: userList } = await admin.auth.admin.listUsers({ perPage: 500 });
        const authUser = userList?.users?.find((u) => u.email?.toLowerCase() === email) ?? null;
        if (!authUser?.id) {
          logInfo("thank_you_session_self_heal_skipped_no_auth_user", {
            requestId,
            sessionId,
            email,
          });
          return;
        }

        const { data: profile } = await admin
          .from("profiles")
          .select("id, stripe_customer_id")
          .eq("id", authUser.id)
          .maybeSingle();
        const profileRow = profile as { id: string; stripe_customer_id?: string | null } | null;
        if (!profileRow) {
          await admin.from("profiles").upsert(
            {
              id: authUser.id,
              stripe_customer_id: stripeCustomerId,
              onboarding_pending: true,
              role: "creator",
            },
            { onConflict: "id" }
          );
        } else if (profileRow.stripe_customer_id !== stripeCustomerId) {
          await admin
            .from("profiles")
            .update({ stripe_customer_id: stripeCustomerId, updated_at: new Date().toISOString() })
            .eq("id", authUser.id);
        }

        if (!stripeSubscriptionId) return;
        const subscription =
          subscriptionForResolution ??
          (await stripe.subscriptions.retrieve(stripeSubscriptionId));
        const creatorId =
          ((session.metadata?.creator_id as string | undefined)?.trim() || "") ||
          getServiceCreatorId();
        const item = subscription.items.data[0];
        await admin.from("subscriptions").upsert(
          {
            creator_id: creatorId,
            subscriber_id: authUser.id,
            status: mapStripeStatus(subscription.status),
            current_period_end: toIsoOrNull(item?.current_period_end ?? null),
            canceled_at: toIsoOrNull(subscription.canceled_at),
            stripe_subscription_id: stripeSubscriptionId,
            stripe_price_id: item?.price?.id ?? null,
          },
          { onConflict: "stripe_subscription_id" }
        );
      } catch (selfHealError) {
        logWarn("thank_you_session_self_heal_failed", {
          requestId,
          sessionId,
          message: selfHealError instanceof Error ? selfHealError.message : String(selfHealError),
        });
      }
    })();

    logInfo("thank_you_session_ready", {
      requestId,
      sessionId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
    });
    return NextResponse.json({
      state: "ready",
      email,
      session_id: sessionId,
      request_id: requestId,
      payment_status: session.payment_status ?? null,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load thank-you state";
    logError("thank_you_session_unhandled_error", err, { requestId });
    return NextResponse.json(
      {
        state: "error",
        error: message,
        request_id: requestId,
      },
      { status: 400 }
    );
  }
}
