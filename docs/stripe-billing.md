# Stripe Billing

## Source of truth

Stripe is the authoritative source for all subscription state. The `subscriptions` table is a mirror, kept in sync exclusively by the webhook handler at `app/api/billing/webhook/route.ts`.

**Never write to `subscriptions` from any other route.**

## Plans and price IDs

Plans defined in `lib/package-plans.ts`:

| Plan key | Price | Mode | Price ID env var |
|---|---|---|---|
| `starter` | $299/mo | subscription | `STRIPE_PRICE_ID_STARTER` |
| `professional` | $599/mo | subscription | `STRIPE_PRICE_ID_PROFESSIONAL` |
| `elite` | $1,299/mo | subscription | `STRIPE_PRICE_ID_ELITE` |
| `single_batch` | $399 one-time | payment | `STRIPE_PRICE_ID_SINGLE_BATCH` |
| `partner_70_30` | $100/mo | subscription | `STRIPE_PRICE_ID_PARTNER_70_30` |
| `partner_50_50` | $1/mo | subscription | `STRIPE_PRICE_ID_PARTNER_50_50` |

Price IDs are resolved at runtime via `lib/stripe-price-for-plan.ts` → `getOrCreatePriceIdForPlan()`. The env var names above map to actual Stripe price IDs that must be set in Vercel.

## Checkout flow

**Route:** `POST /api/billing/checkout`

Two modes:
1. **Plan checkout** (pricing page) — `body.plan` is set. Creates checkout session with `metadata.source = "pricing"`, `metadata.plan`, `metadata.creator_id` (service creator), `metadata.subscriber_id`. Success URL: `https://onlytwins.dev/thank-you?sid={CHECKOUT_SESSION_ID}`.
2. **Creator subscription** (feed page) — `body.creatorId` is set. Creates subscription to a specific creator with `metadata.creator_id` and `metadata.subscriber_id`.
3. **Guest checkout** — `body.plan` set but no auth session. Allowed for plan checkouts only.

Lead conversion: pass `body.leadId` to set `metadata.lead_id` on the session.

**Rate limited:** `RATE_LIMITS.billingCheckout` by IP.
**Suspended users:** rejected with 403.
**Stripe API version:** `2026-01-28.clover`

## Webhook flow

**Route:** `POST /api/billing/webhook`

```
1. Verify Stripe signature (STRIPE_WEBHOOK_SECRET)
2. lockStripeEvent(event) — insert into stripe_webhook_events
   - Duplicate (PG 23505) → return 200, skip processing
   - Missing table (PG 42P01) → throw (idempotency cannot be guaranteed)
3. Process event
4. markStripeEventProcessed(event.id)
5. Return 200
```

**Handled events:**

`checkout.session.completed` with `source = "pricing"` or `source = "admin_pay_link"`:
- Retrieve full session and subscription from Stripe
- Find or create Supabase user by email
- Upsert `profiles` (set `stripe_customer_id`, `onboarding_pending: true`, `role: "creator"`)
- Upsert `subscriptions` (conflict on `stripe_subscription_id`)
- If `lead_id` in metadata: call `convert_lead_to_customer()` RPC

`customer.subscription.created / updated / deleted`:
- Resolve `creator_id` and `subscriber_id` from metadata (fallback: DB lookup, then `stripe_customer_id` → profiles)
- Upsert `subscriptions`
- Log to `revenue_events`

`invoice.payment_failed`:
- Update subscription status to `past_due`
- Log negative amount to `revenue_events`
- Insert into `system_events`

## Status mapping (Stripe → DB)

| Stripe status | DB status |
|---|---|
| `active` | `active` |
| `trialing` | `trialing` |
| `past_due` | `past_due` |
| `unpaid` | `past_due` |
| `canceled` | `canceled` |
| anything else | `expired` |
| `customer.subscription.deleted` event | always `canceled` |

Allowed DB values: `active`, `trialing`, `past_due`, `canceled`, `expired`, `incomplete`, `needs_review`

## Portal flow

**Route:** `POST /api/billing/portal`

- Requires authenticated session
- Looks up `profiles.stripe_customer_id`
- If none exists: creates Stripe customer, saves `stripe_customer_id` to `profiles`
- Creates `billingPortal.sessions` with `return_url` defaulting to `/billing`

## Upgrade flow

**Route:** `POST /api/billing/upgrade-checkout` — creates upgrade session
**Route:** `POST /api/billing/upgrade-preview` — preview proration before confirming

## Admin payment links

**Route:** `POST /api/admin/payment-links`
**Table:** `admin_payment_links`

Admin creates a checkout link for a specific email + plan. When the customer pays, the webhook processes it as `source = "admin_pay_link"` and provisions them identically to the pricing flow.

## Key invariants

- `stripe_customer_id` on `profiles` is the FK between Supabase users and Stripe customers
- Subscriptions upsert on `stripe_subscription_id` (UNIQUE index)
- `stripe_webhook_events.stripe_event_id` is UNIQUE — duplicate delivery is safe
- Revenue events log to `revenue_events` for every subscription created/updated
- The service creator (`getServiceCreatorId()`) is used as `creator_id` for all done-for-you plans

## Bitcoin / Coinbase Commerce checkout

**Route:** `POST /api/billing/bitcoin/checkout`

**Status:** Active. Auth required (no guest checkout). Uses Coinbase Commerce API.

**Requires:** `COINBASE_COMMERCE_API_KEY` env var. If not set, returns 500 with a clear error message.

**Flow:**
1. Auth session required
2. Creates Coinbase Commerce charge for the selected plan
3. Returns redirect URL to Coinbase-hosted payment page
4. After payment: redirects to `/onboarding/creator?payment=success&method=bitcoin&plan={plan}`

**Critical gap — no webhook handler:**
Coinbase Commerce sends webhooks when payment confirms, but there is no handler for them. Payment confirmation is **not automated**. Admin must manually provision the customer after a bitcoin payment.

See `docs/current-known-issues.md` for the tracking issue.

---

## Before touching billing code

Read these files:
- `app/api/billing/checkout/route.ts`
- `app/api/billing/webhook/route.ts`
- `lib/stripe.ts`
- `lib/package-plans.ts`
- `lib/plan-entitlements.ts`
- `lib/stripe-price-for-plan.ts`
- `supabase/migrations/202602150004_create_subscriptions_table.sql`
- `supabase/migrations/202602150005_add_stripe_columns.sql`
- `supabase/migrations/202602150006_create_stripe_webhook_events_table.sql`
- `supabase/migrations/202603100002_expand_subscription_statuses.sql`
