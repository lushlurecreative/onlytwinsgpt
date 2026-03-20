import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import { logError, sendAlert } from "@/lib/observability";

export async function POST() {
  try {
    const supabase = await createClient();
    const admin = getSupabaseAdmin();
    const stripe = getStripe();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find the active subscription
    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id, status")
      .eq("subscriber_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const subRow = sub as {
      stripe_subscription_id: string | null;
      status: string;
    } | null;

    if (!subRow?.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found." },
        { status: 404 }
      );
    }

    // Cancel at period end — does not immediately cancel
    await stripe.subscriptions.update(subRow.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    return NextResponse.json({ cancelled: true }, { status: 200 });
  } catch (error) {
    logError("billing_cancel_unhandled_error", error);
    await sendAlert("billing_cancel_unhandled_error", {
      route: "/api/billing/cancel",
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Unexpected error cancelling subscription." }, { status: 500 });
  }
}
