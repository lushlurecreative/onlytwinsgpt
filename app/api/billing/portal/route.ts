import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/security-config";
import { logError, sendAlert } from "@/lib/observability";

type PortalBody = {
  returnUrl?: string;
};

export async function POST(request: Request) {
  try {
    const ip = getClientIpFromHeaders(request.headers);
    const rl = checkRateLimit(
      `billing-portal:${ip}`,
      RATE_LIMITS.billingCheckout.limit,
      RATE_LIMITS.billingCheckout.windowMs
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many portal attempts. Try again shortly." },
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    let customerId = profile?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { subscriber_id: user.id },
      });
      customerId = customer.id;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }
    }

    let body: PortalBody = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin ?? "http://localhost:3000";
    const returnUrl = body.returnUrl ?? `${baseUrl}/billing`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error) {
    logError("billing_portal_unhandled_error", error);
    await sendAlert("billing_portal_unhandled_error", {
      route: "/api/billing/portal",
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Unexpected billing portal error" }, { status: 500 });
  }
}

