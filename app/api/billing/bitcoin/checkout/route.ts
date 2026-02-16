import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { PACKAGE_PLANS, type PlanKey } from "@/lib/package-plans";

type Body = {
  plan?: PlanKey;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const plan = body.plan;
  if (!plan || !(plan in PACKAGE_PLANS)) {
    return NextResponse.json({ error: "Valid plan is required" }, { status: 400 });
  }

  const coinbaseKey = process.env.COINBASE_COMMERCE_API_KEY;
  if (!coinbaseKey) {
    return NextResponse.json(
      {
        error:
          "Bitcoin checkout is not configured yet. Add COINBASE_COMMERCE_API_KEY to enable it.",
      },
      { status: 500 }
    );
  }

  const selectedPlan = PACKAGE_PLANS[plan];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const redirectPath = `/onboarding/creator?payment=success&method=bitcoin&plan=${plan}`;
  const redirectUrl = `${baseUrl}/login?redirectTo=${encodeURIComponent(redirectPath)}`;
  const cancelUrl = `${baseUrl}/pricing?payment=cancel&method=bitcoin&plan=${plan}`;

  const response = await fetch("https://api.commerce.coinbase.com/charges", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CC-Api-Key": coinbaseKey,
      "X-CC-Version": "2018-03-22",
    },
    body: JSON.stringify({
      name: selectedPlan.name,
      description: `OnlyTwins ${selectedPlan.name}`,
      pricing_type: "fixed_price",
      local_price: {
        amount: selectedPlan.amountUsd.toFixed(2),
        currency: "USD",
      },
      metadata: {
        plan,
        subscriber_id: user.id,
      },
      redirect_url: redirectUrl,
      cancel_url: cancelUrl,
    }),
  });

  const result = (await response.json().catch(() => ({}))) as {
    data?: { hosted_url?: string };
    error?: { message?: string };
  };

  if (!response.ok || !result.data?.hosted_url) {
    return NextResponse.json(
      { error: result.error?.message ?? "Could not create Bitcoin checkout" },
      { status: 400 }
    );
  }

  return NextResponse.json({ hosted_url: result.data.hosted_url }, { status: 200 });
}

