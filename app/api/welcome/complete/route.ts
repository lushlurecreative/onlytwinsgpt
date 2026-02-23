import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

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

    await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password,
    });

    const updates: { full_name?: string | null } = {};
    if (displayName !== null) updates.full_name = displayName || null;
    if (Object.keys(updates).length > 0) {
      await supabaseAdmin.from("profiles").update(updates).eq("id", authUser.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Completion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
