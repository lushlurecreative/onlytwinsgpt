import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getServiceCreatorId } from "@/lib/service-creator";

export async function POST(request: Request) {
  try {
    let body: { session_id?: string; email?: string; password?: string; displayName?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const sessionId = body.session_id?.trim();
    const email = body.email?.trim();
    const password = body.password;
    const displayName = body.displayName?.trim() ?? null;

    if (!sessionId || !email) {
      return NextResponse.json(
        { error: "session_id and email are required" },
        { status: 400 }
      );
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid =
      session.payment_status === "paid" || session.subscription != null;
    if (!paid) {
      return NextResponse.json(
        { error: "Session not paid or invalid" },
        { status: 400 }
      );
    }

    const sessionEmail =
      (session.customer_email ?? session.customer_details?.email) as
        | string
        | undefined;
    if (
      !sessionEmail ||
      sessionEmail.trim().toLowerCase() !== email.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "Email does not match checkout session" },
        { status: 400 }
      );
    }

    const sessionSubscriberId = (session.metadata?.subscriber_id as string)?.trim() || null;

    const supabaseAdmin = getSupabaseAdmin();
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
    const authUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (!authUser?.id) {
      return NextResponse.json(
        { error: "No account found for this email" },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, stripe_customer_id, onboarding_pending, full_name")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: "Could not verify account state" },
        { status: 500 }
      );
    }

    const p = profile as { stripe_customer_id?: string; onboarding_pending?: boolean } | null;
    const hasStripeCustomerId = !!p?.stripe_customer_id;
    const onboardingPending = p?.onboarding_pending === true;
    const serviceCreatorId = getServiceCreatorId();
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("subscriber_id", authUser.id)
      .eq("creator_id", serviceCreatorId)
      .maybeSingle();

    const isSessionForThisUser = sessionSubscriberId === authUser.id;
    const allowed =
      (hasStripeCustomerId && onboardingPending) ||
      !!sub ||
      isSessionForThisUser;
    if (!allowed) {
      return NextResponse.json(
        { error: "This account is not eligible for onboarding" },
        { status: 403 }
      );
    }

    await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password,
    });

    const updates: { full_name?: string | null; onboarding_pending?: boolean } = {
      onboarding_pending: false,
    };
    if (displayName !== null) updates.full_name = displayName || null;

    await supabaseAdmin.from("profiles").update(updates).eq("id", authUser.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Completion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
