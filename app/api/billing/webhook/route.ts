import Stripe from "stripe";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { logError, logWarn, sendAlert } from "@/lib/observability";
import { RATE_LIMITS } from "@/lib/security-config";
import { getServiceCreatorId } from "@/lib/service-creator";
import { PACKAGE_PLANS } from "@/lib/package-plans";
import { getPlanKeyForStripePriceId } from "@/lib/plan-entitlements";
import type { LeadStatus } from "@/lib/db-enums";

export const runtime = "nodejs";

function randomTempPassword(): string {
  return randomBytes(32).toString("hex");
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
    // Migration not applied yet; continue processing so existing behavior still works.
    logWarn("billing_webhook_events_table_missing", { message: error.message });
    return { duplicate: false, missingTable: true };
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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const leadId = (session.metadata?.lead_id as string)?.trim();
      const subscriberId = (session.metadata?.subscriber_id as string)?.trim();
      const creatorId =
        (session.metadata?.creator_id as string)?.trim() || getServiceCreatorId();
      const plan = (session.metadata?.plan as string)?.trim() || null;

      let stripeSubscriptionId: string | null = null;
      if (typeof session.subscription === "string") {
        stripeSubscriptionId = session.subscription;
      } else if (session.subscription && typeof session.subscription === "object" && "id" in session.subscription) {
        stripeSubscriptionId = (session.subscription as { id: string }).id;
      }

      if (leadId && subscriberId && creatorId) {
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
          return NextResponse.json({ error: rpcError.message }, { status: 500 });
        }
      } else if (creatorId && !subscriberId) {
        const customerEmail = (session.customer_email ?? session.customer_details?.email) as string | undefined;
        const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
        if (customerEmail?.trim()) {
          const tempPassword = randomTempPassword();
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: customerEmail.trim(),
            password: tempPassword,
            email_confirm: true,
          });

          if (createError) {
            if ((createError as { message?: string }).message?.includes("already been registered")) {
              const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
              const existing = list?.users?.find((u) => u.email?.toLowerCase() === customerEmail.trim().toLowerCase());
              if (existing) {
                await supabaseAdmin.from("profiles").upsert(
                  { id: existing.id, stripe_customer_id: stripeCustomerId, onboarding_pending: true, role: "creator" },
                  { onConflict: "id" }
                );
                if (leadId) {
                  const { error: rpcErr } = await supabaseAdmin.rpc("convert_lead_to_customer", {
                    p_lead_id: leadId,
                    p_subscriber_id: existing.id,
                    p_creator_id: creatorId,
                    p_stripe_subscription_id: stripeSubscriptionId,
                    p_plan: plan,
                  });
                  if (rpcErr) {
                    logError("billing_webhook_convert_lead_rpc_failed", rpcErr, { stripeEventId: event.id, leadId });
                    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
                  }
                }
              }
            } else {
              logError("billing_webhook_create_user_failed", createError, { stripeEventId: event.id });
              await sendAlert("billing_webhook_create_user_failed", {
                stripeEventId: event.id,
                message: (createError as { message?: string }).message ?? "Unknown",
              });
              return NextResponse.json({ error: (createError as { message?: string }).message ?? "Create user failed" }, { status: 500 });
            }
          } else if (newUser?.user?.id) {
            await supabaseAdmin.from("profiles").upsert(
              { id: newUser.user.id, stripe_customer_id: stripeCustomerId, onboarding_pending: true, role: "creator" },
              { onConflict: "id" }
            );
            if (leadId) {
              const { error: rpcErr } = await supabaseAdmin.rpc("convert_lead_to_customer", {
                p_lead_id: leadId,
                p_subscriber_id: newUser.user.id,
                p_creator_id: creatorId,
                p_stripe_subscription_id: stripeSubscriptionId,
                p_plan: plan,
              });
              if (rpcErr) {
                logError("billing_webhook_convert_lead_rpc_failed", rpcErr, { stripeEventId: event.id, leadId });
                await sendAlert("billing_webhook_convert_lead_rpc_failed", {
                  stripeEventId: event.id,
                  leadId,
                  message: rpcErr.message,
                });
                return NextResponse.json({ error: rpcErr.message }, { status: 500 });
              }
            }
          }
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
        return NextResponse.json(
          { error: "Unable to resolve creator/subscriber from subscription metadata" },
          { status: 400 }
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
        return NextResponse.json({ error: error.message }, { status: 400 });
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
      const leadId = (subscription.metadata?.lead_id as string)?.trim();
      if (leadId && (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated")) {
        const status = mapStripeStatus(subscription.status);
        if (status === "active" || status === "trialing") {
          await supabaseAdmin
            .from("leads")
            .update({ status: "converted" as LeadStatus, updated_at: new Date().toISOString() })
            .eq("id", leadId);
          await supabaseAdmin.from("automation_events").insert({
            event_type: "converted",
            entity_type: "lead",
            entity_id: leadId,
            payload_json: { stripe_subscription_id: subscription.id, subscriber_id: subscriberId },
          });
        }
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

