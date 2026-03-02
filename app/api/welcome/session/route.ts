import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { logError, logInfo, logWarn } from "@/lib/observability";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id")?.trim();
    if (!sessionId) {
      logWarn("welcome_session_missing_session_id", { requestId });
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    logInfo("welcome_session_requested", { requestId, sessionId });
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer", "subscription"],
    });
    const paid =
      session.payment_status === "paid" ||
      session.status === "complete" ||
      session.subscription != null;
    if (!paid) {
      logWarn("welcome_session_not_paid", {
        requestId,
        sessionId,
        payment_status: session.payment_status ?? null,
        session_status: session.status ?? null,
      });
      return NextResponse.json(
        {
          state: "error",
          error: "Session not paid or invalid",
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
      logWarn("welcome_session_missing_email", {
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
    const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
    const stripeSubscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription && typeof session.subscription === "object" && "id" in session.subscription
          ? session.subscription.id
          : null;

    const admin = getSupabaseAdmin();
    const { data: userList } = await admin.auth.admin.listUsers({ perPage: 500 });
    const authUser = userList?.users?.find((u) => u.email?.toLowerCase() === email) ?? null;

    if (!authUser?.id || !stripeCustomerId) {
      logInfo("welcome_session_processing_user_lookup", {
        requestId,
        sessionId,
        has_auth_user: !!authUser?.id,
        has_customer_id: !!stripeCustomerId,
      });
      return NextResponse.json(
        {
          state: "processing",
          ready: false,
          email,
          session_id: sessionId,
          request_id: requestId,
          payment_status: session.payment_status ?? null,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          reason: !authUser?.id ? "auth_user_not_ready" : "stripe_customer_missing",
        },
        { status: 200 }
      );
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("id, onboarding_pending, stripe_customer_id")
      .eq("id", authUser.id)
      .maybeSingle();
    const profileRow = profile as
      | { id: string; onboarding_pending?: boolean | null; stripe_customer_id?: string | null }
      | null;
    if (
      !profileRow ||
      profileRow.stripe_customer_id !== stripeCustomerId ||
      !profileRow.onboarding_pending
    ) {
      logInfo("welcome_session_processing_profile_not_ready", {
        requestId,
        sessionId,
        has_profile: !!profileRow,
        onboarding_pending: profileRow?.onboarding_pending ?? null,
        profile_customer_matches: profileRow?.stripe_customer_id === stripeCustomerId,
      });
      return NextResponse.json(
        {
          state: "processing",
          ready: false,
          email,
          session_id: sessionId,
          request_id: requestId,
          payment_status: session.payment_status ?? null,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          reason: "profile_not_ready",
        },
        { status: 200 }
      );
    }

    logInfo("welcome_session_ready", {
      requestId,
      sessionId,
      user_id: authUser.id,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
    });
    return NextResponse.json({
      state: "ready",
      ready: true,
      email,
      session_id: sessionId,
      request_id: requestId,
      payment_status: session.payment_status ?? null,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load welcome state";
    logError("welcome_session_unhandled_error", err, { requestId });
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
