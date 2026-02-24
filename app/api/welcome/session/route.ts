import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id")?.trim();
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer", "subscription"],
    });
    const paid =
      session.payment_status === "paid" ||
      session.status === "complete" ||
      session.subscription != null;
    if (!paid) {
      return NextResponse.json({ error: "Session not paid or invalid" }, { status: 400 });
    }
    const email =
      (session.customer_details?.email ??
        session.customer_email ??
        (session.customer && typeof session.customer === "object" ? session.customer.email : null) ??
        null)?.trim().toLowerCase() ?? null;
    if (!email) {
      return NextResponse.json({ error: "Missing checkout email" }, { status: 400 });
    }
    const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;

    const admin = getSupabaseAdmin();
    const { data: userList } = await admin.auth.admin.listUsers({ perPage: 500 });
    const authUser = userList?.users?.find((u) => u.email?.toLowerCase() === email) ?? null;

    if (!authUser?.id || !stripeCustomerId) {
      return NextResponse.json({ ready: false, email, session_id: sessionId }, { status: 200 });
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
      return NextResponse.json({ ready: false, email, session_id: sessionId }, { status: 200 });
    }

    return NextResponse.json({
      ready: true,
      email,
      session_id: sessionId,
      stripe_customer_id: stripeCustomerId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load welcome state";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
