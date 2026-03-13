import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { logError, logWarn, sendAlert } from "@/lib/observability";
import { RATE_LIMITS } from "@/lib/security-config";
import { getServiceCreatorId } from "@/lib/service-creator";
import { PACKAGE_PLANS } from "@/lib/package-plans";
import { getPlanKeyForStripePriceId } from "@/lib/plan-entitlements";

export const runtime = "nodejs";

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

function extractStripeSubscriptionId(
  subscription: Stripe.Checkout.Session["subscription"] | null | undefined
) {
  if (!subscription) return null;
  if (typeof subscription === "string") return subscription;
  if (typeof subscription === "object" && "id" in subscription && typeof subscription.id === "string") {
    return subscription.id;
  }
  return null;
}

async function resolveSubscriptionParties(subscription: Stripe.Subscription) {
  const supabaseAdmin = getSupabaseAdmin();
  let creatorId: string | null = subscription.metadata?.creator_id ?? null;
  let subscriberId: string | null = subscription.metadata?.subscriber_id ?? null;

  // Done-for-you plans may omit creator_id. In that case, use the service creator id.
  const planKey = (subscription.metadata?.plan ?? "").trim();
  if (!creatorId && planKey) {
    creatorId = getServiceCreatorId();
  }

  if (!creatorId || !subscriberId) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("creator_id, subscriber_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();
    const row = data as { creator_id: string | null; subscriber_id: string | null } | null;

    creatorId = creatorId ?? row?.creator_id ?? null;
    subscriberId = subscriberId ?? row?.subscriber_id ?? null;
  }

  if (!subscriberId && typeof subscription.customer === "string") {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", subscription.customer)
      .maybeSingle();
    const profileRow = data as { id: string | null } | null;

    subscriberId = profileRow?.id ?? null;
  }

  return { creatorId, subscriberId };
}

async function lockStripeEvent(event: Stripe.Event) {
  const supabaseAdmin = getSupabaseAdmin();
  const webhookTable = supabaseAdmin.from("stripe_webhook_events");
  const { error } = await webhookTable.insert({
    stripe_event_id: event.id,
    event_type: event.type,
    processed_at: null,
  });

  if (!error) {
    return { duplicate: false, missingTable: false };
  }

  const code = (error as { code?: string }).code;
  if (code === "23505") {
    // Duplicate Stripe delivery (or manual replay) - treat as success and no-op.
    return { duplicate: true, missingTable: false };
  }

  if (code === "42P01") {
    // Idempotency is mandatory for billing writes.
    throw new Error("stripe_webhook_events table missing; idempotency cannot be guaranteed");
  }

  throw error;
}

async function markStripeEventProcessed(eventId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const webhookTable = supabaseAdmin.from("stripe_webhook_events");
  const { error } = await webhookTable
    .update({ processed_at: new Date().toISOString() })
    .eq("stripe_event_id", eventId);

  if (error) {
    const code = (error as { code?: string }).code;
    if (code !== "42P01") {
      logWarn("billing_webhook_mark_processed_failed", {
        stripeEventId: eventId,
        message: error.message,
      });
    }
  }
}

export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();
    const ip = getClientIpFromHeaders(request.headers);
    const rl = checkRateLimit(
      `billing-webhook:${ip}`,
      RATE_LIMITS.billingWebhook.limit,
      RATE_LIMITS.billingWebhook.windowMs
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many webhook requests." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }
    const signature = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      return NextResponse.json(
        { error: "Missing stripe signature or STRIPE_WEBHOOK_SECRET" },
        { status: 400 }
      );
    }

    const payload = await request.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid webhook signature";
      logWarn("billing_webhook_bad_signature", { message });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const lock = await lockStripeEvent(event);
    if (lock.duplicate) {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }
    const failAfterLock = async (status: number, body: Record<string, unknown>) => {
      await markStripeEventProcessed(event.id);
      return NextResponse.json(body, { status });
    };

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const source = (session.metadata?.source as string)?.trim() ?? "";
      const leadId = (session.metadata?.lead_id as string)?.trim();
      let subscriberId: string | null = (session.metadata?.subscriber_id as string)?.trim() ?? null;
      const creatorId =
        (session.metadata?.creator_id as string)?.trim() || getServiceCreatorId();
      const plan = (session.metadata?.plan as string)?.trim() || null;
      const isKnownPlan =
        !!plan && Object.prototype.hasOwnProperty.call(PACKAGE_PLANS, plan);

      let stripeSubscriptionId: string | null = null;
      stripeSubscriptionId = extractStripeSubscriptionId(session.subscription);

      // Canonical onboarding flow: pricing or admin pay-now link -> webhook provisioning -> thank-you auth.
      if ((source === "pricing" || source === "admin_pay_link") && isKnownPlan) {
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["customer", "subscription"],
        });
        const customerEmail = (
          fullSession.customer_details?.email ??
          fullSession.customer_email ??
          (fullSession.customer &&
          typeof fullSession.customer === "object" &&
          "email" in fullSession.customer
            ? fullSession.customer.email
            : null) ??
          null
        )?.trim();
        stripeSubscriptionId =
          extractStripeSubscriptionId(fullSession.subscription) ?? stripeSubscriptionId;
        let stripeCustomerId = extractStripeCustomerId(fullSession.customer);
        let resolvedSubscription: Stripe.Subscription | null = null;
        if (!stripeCustomerId && stripeSubscriptionId) {
          resolvedSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          stripeCustomerId = extractStripeCustomerId(resolvedSubscription.customer);
        }
        if (!customerEmail || !stripeCustomerId) {
          return failAfterLock(
            400,
            {
              error: "Missing customer email or customer id for onboarding flow",
              diagnostics: {
                session_id: fullSession.id,
                session_customer_type: typeof fullSession.customer,
                stripe_subscription_id: stripeSubscriptionId,
              },
            }
          );
        }

        if (!subscriberId) {
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
          const existing = list?.users?.find(
            (u) => u.email?.toLowerCase() === customerEmail.toLowerCase()
          );
          subscriberId = existing?.id ?? null;
        }

        if (!subscriberId) {
          const { data: existingProfile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("stripe_customer_id", stripeCustomerId)
            .maybeSingle();
          const profileRow = existingProfile as { id?: string | null } | null;
          subscriberId = profileRow?.id ?? null;
        }

        if (!subscriberId) {
          const tempPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
          const { data: createdUser, error: createUserError } =
            await supabaseAdmin.auth.admin.createUser({
              email: customerEmail.toLowerCase(),
              password: tempPassword,
              email_confirm: true,
            });
          if (!createUserError && createdUser.user?.id) {
            subscriberId = createdUser.user.id;
          } else {
            const { data: usersRetry } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
            const existingRetry = usersRetry?.users?.find(
              (u) => u.email?.toLowerCase() === customerEmail.toLowerCase()
            );
            subscriberId = existingRetry?.id ?? null;
          }
        }

        if (!subscriberId) {
          return failAfterLock(
            500,
            {
              error: "Unable to resolve or create subscriber for checkout.session.completed",
              session_id: fullSession.id,
            }
          );
        }

        const { error: profileUpsertError } = await supabaseAdmin.from("profiles").upsert(
          {
            id: subscriberId,
            stripe_customer_id: stripeCustomerId,
            onboarding_pending: true,
            role: "creator",
          },
          { onConflict: "id" }
        );
        if (profileUpsertError) {
          logError("billing_webhook_checkout_profile_upsert_failed", profileUpsertError, {
            stripeEventId: event.id,
            sessionId: fullSession.id,
            subscriberId,
          });
          return failAfterLock(500, { error: profileUpsertError.message });
        }

        if (stripeSubscriptionId && creatorId && subscriberId) {
          const subscription =
            resolvedSubscription ?? (await stripe.subscriptions.retrieve(stripeSubscriptionId));
          const item = subscription.items.data[0];
          const subscriptionsTable = supabaseAdmin.from("subscriptions");
          const { error: subUpsertError } = await subscriptionsTable.upsert(
            {
              creator_id: creatorId,
              subscriber_id: subscriberId,
              status: mapStripeStatus(subscription.status),
              current_period_end: toIsoOrNull(item?.current_period_end ?? null),
              canceled_at: toIsoOrNull(subscription.canceled_at),
              stripe_subscription_id: stripeSubscriptionId,
              stripe_price_id: item?.price?.id ?? null,
            },
            { onConflict: "stripe_subscription_id" }
          );
          if (subUpsertError) {
            logError("billing_webhook_checkout_subscription_upsert_failed", subUpsertError, {
              stripeEventId: event.id,
              stripeSubscriptionId,
              subscriberId,
            });
          }
        } else if (stripeSubscriptionId) {
          return failAfterLock(
            500,
            {
              error: "Unable to persist subscription during checkout.session.completed",
              stripe_subscription_id: stripeSubscriptionId,
            }
          );
        }
      }

      if (source === "pricing" && isKnownPlan && leadId && subscriberId && creatorId) {
        const { error: rpcError } = await supabaseAdmin.rpc("convert_lead_to_customer", {
          p_lead_id: leadId,
          p_subscriber_id: subscriberId,
          p_creator_id: creatorId,
          p_stripe_subscription_id: stripeSubscriptionId,
          p_plan: plan,
        });

        if (rpcError) {
          logError("billing_webhook_convert_lead_rpc_failed", rpcError, {
            stripeEventId: event.id,
            leadId,
          });
          await sendAlert("billing_webhook_convert_lead_rpc_failed", {
            stripeEventId: event.id,
            leadId,
            message: rpcError.message,
          });
          return failAfterLock(500, { error: rpcError.message });
        }
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const { creatorId, subscriberId } = await resolveSubscriptionParties(subscription);

      if (!creatorId || !subscriberId) {
        return failAfterLock(
          400,
          { error: "Unable to resolve creator/subscriber from subscription metadata" },
        );
      }

      const item = subscription.items.data[0];
      const priceId = item?.price?.id ?? null;
      const currentPeriodEnd = item?.current_period_end ?? null;
      const status =
        event.type === "customer.subscription.deleted"
          ? "canceled"
          : mapStripeStatus(subscription.status);

      const subscriptionsTable = supabaseAdmin.from("subscriptions");
      const { error } = await subscriptionsTable.upsert(
        {
          creator_id: creatorId,
          subscriber_id: subscriberId,
          status,
          current_period_end: toIsoOrNull(currentPeriodEnd),
          canceled_at: toIsoOrNull(subscription.canceled_at),
          stripe_subscription_id: subscription.id,
          stripe_price_id: priceId,
        },
        { onConflict: "stripe_subscription_id" }
      );

      if (error) {
        logError("billing_webhook_subscription_upsert_failed", error, {
          subscriptionId: subscription.id,
          stripeEventId: event.id,
        });
        await sendAlert("billing_webhook_subscription_upsert_failed", {
          subscriptionId: subscription.id,
          stripeEventId: event.id,
          message: error.message,
        });
        return failAfterLock(400, { error: error.message });
      }

      const planKey = getPlanKeyForStripePriceId(priceId);
      const amountCents = planKey ? Math.round(PACKAGE_PLANS[planKey].amountUsd * 100) : 0;
      if (amountCents > 0) {
        await supabaseAdmin.from("revenue_events").insert({
          user_id: subscriberId,
          lead_id: (subscription.metadata?.lead_id as string) || null,
          amount_cents: amountCents,
          currency: "usd",
          stripe_event_id: event.id,
          plan_key: planKey,
        });
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceAny = invoice as unknown as {
        subscription?: string | { id?: string | null } | null;
        customer?: string | { id?: string | null } | null;
      };
      try {
        const subscriptionId =
          typeof invoiceAny.subscription === "string"
            ? invoiceAny.subscription
            : invoiceAny.subscription &&
                typeof invoiceAny.subscription === "object" &&
                "id" in invoiceAny.subscription
              ? invoiceAny.subscription.id ?? null
              : null;
        const customerId =
          typeof invoiceAny.customer === "string"
            ? invoiceAny.customer
            : invoiceAny.customer &&
                typeof invoiceAny.customer === "object" &&
                "id" in invoiceAny.customer
              ? invoiceAny.customer.id ?? null
              : null;

        let creatorId: string | null = null;
        let subscriberId: string | null = null;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const parties = await resolveSubscriptionParties(subscription);
          creatorId = parties.creatorId;
          subscriberId = parties.subscriberId;
        }

        if (!subscriberId && customerId) {
          const { data: profileByCustomer } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          const profileRow = profileByCustomer as { id?: string | null } | null;
          subscriberId = profileRow?.id ?? null;
        }

        if (subscriptionId) {
          const { error: statusError } = await supabaseAdmin
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("stripe_subscription_id", subscriptionId);
          if (statusError) {
            logWarn("billing_webhook_invoice_failed_subscription_status_update_failed", {
              stripeEventId: event.id,
              stripeSubscriptionId: subscriptionId,
              message: statusError.message,
            });
          }
        }

        if (subscriberId) {
          const failedAmount = -Math.abs(invoice.amount_due || invoice.amount_remaining || 0);
          await supabaseAdmin.from("revenue_events").insert({
            user_id: subscriberId,
            lead_id: null,
            amount_cents: failedAmount,
            currency: invoice.currency || "usd",
            stripe_event_id: event.id,
            plan_key: null,
          });
        } else {
          logWarn("billing_webhook_invoice_failed_missing_subscriber", {
            stripeEventId: event.id,
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId: customerId,
          });
        }

        await supabaseAdmin.from("system_events").insert({
          event_type: "stripe_invoice_payment_failed",
          payload: {
            severity: "warning",
            stripe_event_id: event.id,
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            creator_id: creatorId,
            subscriber_id: subscriberId,
            amount_due: invoice.amount_due ?? null,
            currency: invoice.currency ?? null,
          },
        });
      } catch (invoiceError) {
        logWarn("billing_webhook_invoice_failed_handler_error", {
          stripeEventId: event.id,
          message: invoiceError instanceof Error ? invoiceError.message : String(invoiceError),
        });
      }
    }

    await markStripeEventProcessed(event.id);
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logError("billing_webhook_unhandled_error", error);
    await sendAlert("billing_webhook_unhandled_error", {
      route: "/api/billing/webhook",
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Unexpected webhook error" }, { status: 500 });
  }
}

