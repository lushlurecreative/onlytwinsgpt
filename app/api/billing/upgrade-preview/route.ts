import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { PACKAGE_PLANS, type PlanKey } from "@/lib/package-plans";
import {
  getCurrentSubscriberPlan,
  isUpgradePath,
  resolveTargetPriceId,
} from "@/lib/subscriber-upgrade";
export const runtime = "nodejs";

function centsToMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export async function GET(request: Request) {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const targetPlan = (new URL(request.url).searchParams.get("targetPlan") ?? "").trim() as PlanKey;
  if (!targetPlan || !(targetPlan in PACKAGE_PLANS)) {
    return NextResponse.json({ error: "Invalid target plan." }, { status: 400 });
  }

  const current = await getCurrentSubscriberPlan(user.id);
  if (!current.stripeSubscriptionId || !current.currentPlanKey) {
    return NextResponse.json({ error: "No active Stripe subscription found." }, { status: 400 });
  }
  if (!isUpgradePath(current.currentPlanKey, targetPlan)) {
    return NextResponse.json({ error: "Target plan is not a valid upgrade." }, { status: 400 });
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(current.stripeSubscriptionId);
  const subscriptionItem = subscription.items.data[0];
  if (!subscriptionItem?.id) {
    return NextResponse.json({ error: "Could not locate current subscription item." }, { status: 400 });
  }
  const targetPriceId = resolveTargetPriceId(targetPlan);
  const targetPrice = await stripe.prices.retrieve(targetPriceId);
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;
  if (!customerId) {
    return NextResponse.json({ error: "Stripe customer not found." }, { status: 400 });
  }

  const upcoming = await stripe.invoices.createPreview({
    customer: customerId,
    subscription: subscription.id,
    subscription_details: {
      items: [{ id: subscriptionItem.id, price: targetPriceId, quantity: 1 }],
      proration_behavior: "always_invoice",
    },
  });

  const prorationLines = upcoming.lines.data.filter((line) => {
    const parent = line.parent as { subscription_item_details?: { proration?: boolean } } | null;
    return Boolean(parent?.subscription_item_details?.proration);
  });
  const creditCents = Math.abs(
    prorationLines
      .filter((line) => line.amount < 0)
      .reduce((sum, line) => sum + Math.abs(line.amount), 0)
  );
  const prorationChargeCents = prorationLines
    .filter((line) => line.amount > 0)
    .reduce((sum, line) => sum + line.amount, 0);
  const dueTodayCents = Math.max(0, upcoming.amount_due ?? 0);
  const currency = (upcoming.currency ?? "usd").toUpperCase();

  return NextResponse.json(
    {
      currentPlan: {
        key: current.currentPlanKey,
        name: PACKAGE_PLANS[current.currentPlanKey].name,
        monthlyPriceCents: Math.round(PACKAGE_PLANS[current.currentPlanKey].amountUsd * 100),
      },
      targetPlan: {
        key: targetPlan,
        name: PACKAGE_PLANS[targetPlan].name,
        monthlyPriceCents: targetPrice.unit_amount ?? Math.round(PACKAGE_PLANS[targetPlan].amountUsd * 100),
      },
      preview: {
        customerCreditCents: creditCents,
        prorationChargeCents,
        dueTodayCents,
        currency,
        customerCreditFormatted: centsToMoney(creditCents, currency),
        prorationChargeFormatted: centsToMoney(prorationChargeCents, currency),
        dueTodayFormatted: centsToMoney(dueTodayCents, currency),
      },
    },
    { status: 200 }
  );
}
