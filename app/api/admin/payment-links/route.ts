import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import { isAdminUser } from "@/lib/admin";
import { getServiceCreatorId } from "@/lib/service-creator";
import { getOrCreatePriceIdForPlan } from "@/lib/stripe-price-for-plan";
import { PACKAGE_PLANS, type PlanKey } from "@/lib/package-plans";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdminUser(user.id, user.email)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

/** GET: List pending payment links for the service creator. Admin only. */
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin();
  const serviceCreatorId = getServiceCreatorId();

  const { data: rows, error } = await admin
    .from("admin_payment_links")
    .select("id, email, plan, checkout_url, full_name, admin_notes, created_at, stripe_checkout_session_id")
    .eq("creator_id", serviceCreatorId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const list = (rows ?? []).map((r) => ({
    id: (r as { id: string }).id,
    email: (r as { email: string }).email,
    plan: (r as { plan: string }).plan,
    checkoutUrl: (r as { checkout_url: string | null }).checkout_url,
    fullName: (r as { full_name: string | null }).full_name ?? null,
    adminNotes: (r as { admin_notes: string | null }).admin_notes ?? null,
    createdAt: (r as { created_at: string }).created_at,
    stripeCheckoutSessionId: (r as { stripe_checkout_session_id: string | null }).stripe_checkout_session_id ?? null,
  }));

  return NextResponse.json({ paymentLinks: list }, { status: 200 });
}

/** POST: Create a pay-now checkout session and store the link. Admin only. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    plan?: string;
    fullName?: string | null;
    adminNotes?: string | null;
  };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const planRaw = (body.plan ?? "").trim() as PlanKey;
  if (!planRaw || !Object.prototype.hasOwnProperty.call(PACKAGE_PLANS, planRaw)) {
    return NextResponse.json(
      { error: "Valid plan is required (e.g. starter, professional, elite, single_batch)." },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const stripe = getStripe();
  const serviceCreatorId = getServiceCreatorId();
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? (request.url ? new URL(request.url).origin : "https://onlytwins.dev");

  const planPriceId = await getOrCreatePriceIdForPlan(stripe, admin, planRaw);
  const isOneTime = planRaw === "single_batch";
  const successUrl = `${baseUrl.replace(/\/$/, "")}/thank-you?sid={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl.replace(/\/$/, "")}/admin/customers?payment=cancel`;

  const metadata: Record<string, string> = {
    source: "admin_pay_link",
    plan: planRaw,
    creator_id: serviceCreatorId,
  };

  const session = await stripe.checkout.sessions.create({
    mode: isOneTime ? "payment" : "subscription",
    customer_email: email,
    line_items: [{ price: planPriceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    ...(isOneTime ? { customer_creation: "always" as const } : {}),
    ...(isOneTime
      ? {}
      : {
          subscription_data: {
            metadata: { ...metadata },
          },
        }),
  });

  const checkoutUrl = session.url ?? null;
  const { data: inserted, error } = await admin
    .from("admin_payment_links")
    .insert({
      creator_id: serviceCreatorId,
      email,
      plan: planRaw,
      stripe_checkout_session_id: session.id,
      checkout_url: checkoutUrl,
      full_name: body.fullName?.trim() || null,
      admin_notes: body.adminNotes?.trim() || null,
    })
    .select("id, created_at")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Failed to store payment link." }, { status: 400 });
  }

  return NextResponse.json(
    {
      url: checkoutUrl,
      id: (inserted as { id: string }).id,
      paymentLinkId: (inserted as { id: string }).id,
      createdAt: (inserted as { created_at: string }).created_at,
    },
    { status: 201 }
  );
}
