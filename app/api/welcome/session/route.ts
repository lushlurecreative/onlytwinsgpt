import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id")?.trim();
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const paid =
      session.payment_status === "paid" ||
      (session.subscription != null && typeof session.subscription === "object");

    if (!paid) {
      return NextResponse.json(
        { error: "Session not paid or invalid" },
        { status: 400 }
      );
    }

    const email =
      session.customer_email ??
      (session.customer_details?.email as string | undefined) ??
      null;
    if (!email) {
      return NextResponse.json(
        { error: "No customer email on session" },
        { status: 400 }
      );
    }

    return NextResponse.json({ email, customerId: session.customer ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load session";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
