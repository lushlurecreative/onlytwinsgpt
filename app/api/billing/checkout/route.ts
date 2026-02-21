import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { logError, sendAlert } from "@/lib/observability";
import { RATE_LIMITS } from "@/lib/security-config";
import { PRICE_ID_ENV_BY_PLAN, type PlanKey } from "@/lib/package-plans";
import { getServiceCreatorId } from "@/lib/service-creator";
import { isUserSuspended } from "@/lib/suspend";

type CheckoutBody = {
  creatorId?: string;
  successUrl?: string;
  cancelUrl?: string;
  plan?: PlanKey;
  /** When a lead converts via checkout, pass their lead_id so webhook can set status=converted. */
  leadId?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function POST(request: Request) {
  try {
    const ip = getClientIpFromHeaders(request.headers);
    const rl = checkRateLimit(
      `billing-checkout:${ip}`,
      RATE_LIMITS.billingCheckout.limit,
      RATE_LIMITS.billingCheckout.windowMs
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many checkout attempts. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const supabase = await createClient();
    const stripe = getStripe();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = getSupabaseAdmin();
    if (await isUserSuspended(admin, user.id)) {
      return NextResponse.json({ error: "Account access is suspended." }, { status: 403 });
    }

    let body: CheckoutBody = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const creatorId = body.creatorId?.trim();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    let stripeCustomerId = profile?.stripe_customer_id ?? null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { subscriber_id: user.id },
      });
      stripeCustomerId = customer.id;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", user.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin ?? "http://localhost:3000";

    let session;
    if (body.plan) {
      const envName = PRICE_ID_ENV_BY_PLAN[body.plan];
      const planPriceId = process.env[envName];
      if (!planPriceId) {
        return NextResponse.json(
          { error: `Missing environment variable ${envName} for selected plan` },
          { status: 500 }
        );
      }
      const isOneTime = body.plan === "single_batch";
      const redirectPath = `/onboarding/creator?payment=success&method=stripe&plan=${body.plan}`;
      const successUrl = body.successUrl ?? `${baseUrl}${redirectPath}`;
      const cancelUrl = body.cancelUrl ?? `${baseUrl}/pricing?payment=cancel&method=stripe&plan=${body.plan}`;
      const serviceCreatorId = getServiceCreatorId();
      const metadata: Record<string, string> = {
        plan: body.plan,
        creator_id: serviceCreatorId,
        subscriber_id: user.id,
      };
      if (body.leadId?.trim()) metadata.lead_id = body.leadId.trim();
      session = await stripe.checkout.sessions.create({
        mode: isOneTime ? "payment" : "subscription",
        customer: stripeCustomerId,
        line_items: [{ price: planPriceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        ...(isOneTime
          ? {}
          : {
              subscription_data: {
                metadata: { ...metadata },
              },
            }),
      });
    } else {
      const priceId = process.env.STRIPE_PRICE_ID;
      if (!priceId) {
        return NextResponse.json({ error: "STRIPE_PRICE_ID is not set" }, { status: 500 });
      }
      if (!creatorId || !isUuid(creatorId)) {
        return NextResponse.json({ error: "Valid creatorId is required" }, { status: 400 });
      }
      if (creatorId === user.id) {
        return NextResponse.json({ error: "Cannot subscribe to yourself" }, { status: 400 });
      }
      const successUrl = body.successUrl ?? `${baseUrl}/feed/creator/${creatorId}`;
      const cancelUrl = body.cancelUrl ?? `${baseUrl}/feed/creator/${creatorId}`;
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          creator_id: creatorId,
          subscriber_id: user.id,
        },
        subscription_data: {
          metadata: {
            creator_id: creatorId,
            subscriber_id: user.id,
          },
        },
      });
    }

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error: unknown) {
    logError("billing_checkout_unhandled_error", error);
    const errMessage =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : typeof error === "string"
            ? error
            : "Unexpected checkout error";
    await sendAlert("billing_checkout_unhandled_error", {
      route: "/api/billing/checkout",
      message: errMessage,
    });
    return NextResponse.json({ error: errMessage }, { status: 500 });
  }
}

