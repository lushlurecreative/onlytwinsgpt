export type PlanKey =
  | "starter"
  | "professional"
  | "elite"
  | "single_batch"
  | "partner_70_30"
  | "partner_50_50";

export const PACKAGE_PLANS: Record<
  PlanKey,
  {
    name: string;
    displayPrice: string;
    mode: "subscription" | "payment";
    amountUsd: number;
  }
> = {
  starter: {
    name: "OnlyTwins Starter",
    displayPrice: "$299/mo",
    mode: "subscription",
    amountUsd: 299,
  },
  professional: {
    name: "OnlyTwins Professional",
    displayPrice: "$599/mo",
    mode: "subscription",
    amountUsd: 599,
  },
  elite: {
    name: "OnlyTwins Elite",
    displayPrice: "$1,299/mo",
    mode: "subscription",
    amountUsd: 1299,
  },
  single_batch: {
    name: "Single Content Batch",
    displayPrice: "$399 one-time",
    mode: "payment",
    amountUsd: 399,
  },
  partner_70_30: {
    name: "70/30 Partner Package",
    displayPrice: "$100/mo + rev share",
    mode: "subscription",
    amountUsd: 100,
  },
  partner_50_50: {
    name: "50/50 Partner Package",
    displayPrice: "$1/mo + rev share",
    mode: "subscription",
    amountUsd: 1,
  },
};

export const PRICE_ID_ENV_BY_PLAN: Record<PlanKey, string> = {
  starter: "STRIPE_PRICE_ID_STARTER",
  professional: "STRIPE_PRICE_ID_PROFESSIONAL",
  elite: "STRIPE_PRICE_ID_ELITE",
  single_batch: "STRIPE_PRICE_ID_SINGLE_BATCH",
  partner_70_30: "STRIPE_PRICE_ID_PARTNER_70_30",
  partner_50_50: "STRIPE_PRICE_ID_PARTNER_50_50",
};

