import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PACKAGE_PLANS, type PlanKey } from "@/lib/package-plans";

/** Get price ID from app_settings or create product+price in Stripe and save it. */
export async function getOrCreatePriceIdForPlan(
  stripe: Stripe,
  admin: SupabaseClient,
  plan: PlanKey
): Promise<string> {
  const settingsKey = `stripe_price_${plan}`;
  const { data: row } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", settingsKey)
    .maybeSingle();
  const stored = (row as { value?: string } | null)?.value?.trim();
  if (stored) return stored;

  const p = PACKAGE_PLANS[plan];
  const product = await stripe.products.create({ name: p.name });
  const priceParams: {
    product: string;
    unit_amount: number;
    currency: string;
    recurring?: { interval: "month" };
  } = {
    product: product.id,
    unit_amount: Math.round(p.amountUsd * 100),
    currency: "usd",
  };
  if (p.mode === "subscription") priceParams.recurring = { interval: "month" };
  const price = await stripe.prices.create(priceParams);

  await admin.from("app_settings").upsert(
    { key: settingsKey, value: price.id, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  return price.id;
}
