import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    let body: {
      session_id?: string;
      email?: string;
      password?: string;
      confirm_password?: string;
      displayName?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const sessionId = body.session_id?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const confirmPassword = body.confirm_password;
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
    if (confirmPassword !== undefined && confirmPassword !== password) {
      return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
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
    const sessionEmail =
      (session.customer_details?.email ??
        session.customer_email ??
        (session.customer && typeof session.customer === "object" ? session.customer.email : null) ??
        null)?.trim().toLowerCase() ?? null;
    if (!sessionEmail || sessionEmail !== email) {
      return NextResponse.json({ error: "Email does not match checkout session" }, { status: 400 });
    }
    const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
    if (!stripeCustomerId) {
      return NextResponse.json({ error: "Missing checkout customer id" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
    const authUser = listData?.users?.find((u) => u.email?.toLowerCase() === email) ?? null;
    if (!authUser?.id) {
      return NextResponse.json({ error: "Account setup is still in progress" }, { status: 409 });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, onboarding_pending, stripe_customer_id")
      .eq("id", authUser.id)
      .maybeSingle();
    const profileRow = profile as
      | { id: string; onboarding_pending?: boolean | null; stripe_customer_id?: string | null }
      | null;
    if (!profileRow || profileRow.stripe_customer_id !== stripeCustomerId) {
      return NextResponse.json({ error: "Account setup is still in progress" }, { status: 409 });
    }
    if (!profileRow.onboarding_pending) {
      return NextResponse.json({ error: "Welcome link is invalid or expired" }, { status: 403 });
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
