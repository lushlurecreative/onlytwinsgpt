import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getServiceCreatorId } from "@/lib/service-creator";
import { PACKAGE_PLANS, type PlanKey } from "@/lib/package-plans";
import { logError, logInfo, logWarn } from "@/lib/observability";

export const runtime = "nodejs";

function mapStatusForBitcoin() {
  return "active" as const;
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  try {
    const hmac = createHmac("sha256", secret);
    hmac.update(payload, "utf8");
    const digest = hmac.digest("hex");
    const sigBuffer = Buffer.from(signature, "hex");
    const digestBuffer = Buffer.from(digest, "hex");
    if (sigBuffer.length !== digestBuffer.length) return false;
    return timingSafeEqual(sigBuffer, digestBuffer);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const webhookSecret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logWarn("coinbase_webhook_secret_missing", { requestId });
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    const signature = request.headers.get("x-cc-webhook-signature") ?? "";
    const payload = await request.text();

    if (!verifySignature(payload, signature, webhookSecret)) {
      logWarn("coinbase_webhook_bad_signature", { requestId });
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    let event: { type: string; data?: { object?: Record<string, unknown> } };
    try {
      event = JSON.parse(payload);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    logInfo("coinbase_webhook_received", { requestId, type: event.type });

    // Only provision on confirmed payment
    if (event.type !== "charge:confirmed") {
      return NextResponse.json({ received: true, skipped: true }, { status: 200 });
    }

    const charge = event.data?.object ?? {};
    const metadata = (charge.metadata ?? {}) as Record<string, string>;
    const plan = (metadata.plan ?? "").trim() as PlanKey;
    const subscriberId = (metadata.subscriber_id ?? "").trim() || null;

    if (!plan || !(plan in PACKAGE_PLANS)) {
      logWarn("coinbase_webhook_unknown_plan", { requestId, plan });
      return NextResponse.json({ error: "Unknown plan in metadata" }, { status: 400 });
    }

    if (!subscriberId) {
      logWarn("coinbase_webhook_missing_subscriber", { requestId, plan });
      return NextResponse.json({ error: "Missing subscriber_id in metadata" }, { status: 400 });
    }

    const creatorId = getServiceCreatorId();
    const admin = getSupabaseAdmin();

    // Upsert profile with creator role
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: subscriberId,
        role: "creator",
        onboarding_pending: true,
      },
      { onConflict: "id" }
    );
    if (profileError) {
      logError("coinbase_webhook_profile_upsert_failed", profileError, { requestId, subscriberId });
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // Upsert subscription row — no Stripe IDs for bitcoin, use a synthetic key
    const syntheticSubId = `btc_${charge.id ?? requestId}`;
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: subError } = await admin.from("subscriptions").upsert(
      {
        creator_id: creatorId,
        subscriber_id: subscriberId,
        status: mapStatusForBitcoin(),
        current_period_end: periodEnd,
        stripe_subscription_id: syntheticSubId,
        stripe_price_id: null,
        canceled_at: null,
      },
      { onConflict: "stripe_subscription_id" }
    );
    if (subError) {
      logError("coinbase_webhook_subscription_upsert_failed", subError, { requestId, subscriberId });
      return NextResponse.json({ error: subError.message }, { status: 500 });
    }

    // Record revenue event
    const selectedPlan = PACKAGE_PLANS[plan];
    const amountCents = Math.round(selectedPlan.amountUsd * 100);
    await admin.from("revenue_events").insert({
      user_id: subscriberId,
      lead_id: null,
      amount_cents: amountCents,
      currency: "usd",
      stripe_event_id: syntheticSubId,
      plan_key: plan,
    });

    logInfo("coinbase_webhook_provisioned", { requestId, subscriberId, plan });
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    logError("coinbase_webhook_unhandled_error", err, { requestId });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
