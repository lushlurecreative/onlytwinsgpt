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

type Body = {
  targetPlan?: PlanKey;
  returnUrl?: string;
};

export async function POST(request: Request) {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const targetPlan = body.targetPlan as PlanKey;
  if (!targetPlan || !(targetPlan in PACKAGE_PLANS)) {
    return NextResponse.json({ error: "Invalid target plan." }, { status: 400 });
  }

  const current = await getCurrentSubscriberPlan(user.id);
  if (!current.stripeSubscriptionId || !current.currentPlanKey) {
    return NextResponse.json({ error: "No active subscription found." }, { status: 400 });
  }
  if (!isUpgradePath(current.currentPlanKey, targetPlan)) {
    return NextResponse.json({ error: "Target plan is not a valid upgrade." }, { status: 400 });
  }

  const stripe = getStripe();
  const targetPriceId = resolveTargetPriceId(targetPlan);
  const subscription = await stripe.subscriptions.retrieve(current.stripeSubscriptionId);
  const subscriptionItem = subscription.items.data[0];
  if (!subscriptionItem?.id) {
    return NextResponse.json({ error: "Could not find subscription item." }, { status: 400 });
  }
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;
  if (!customerId) {
    return NextResponse.json({ error: "Stripe customer not found." }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const returnUrl = body.returnUrl ?? `${baseUrl}/upgrade`;

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      flow_data: {
        type: "subscription_update_confirm",
        after_completion: {
          type: "redirect",
          redirect: { return_url: returnUrl },
        },
        subscription_update_confirm: {
          subscription: subscription.id,
          items: [{ id: subscriptionItem.id, price: targetPriceId, quantity: 1 }],
        },
      },
    });
    return NextResponse.json({ url: portalSession.url }, { status: 200 });
  } catch {
    const fallbackSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: fallbackSession.url }, { status: 200 });
  }
}
