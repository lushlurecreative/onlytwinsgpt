# Billing Flow

## Overview

Stripe is the source of truth for all subscription state. The `subscriptions` table is a mirror, kept in sync exclusively via the Stripe webhook.

## Checkout Flow

```
User clicks "Subscribe"
  → POST /api/billing/checkout
  → Creates Stripe Checkout Session
  → Redirects to Stripe hosted checkout
  → Stripe redirects to /thank-you?session_id=...
  → /api/thank-you/session confirms session
  → /api/thank-you/complete marks onboarding
```

**Key files**:
- `app/api/billing/checkout/route.ts`
- `app/thank-you/page.tsx`
- `app/api/thank-you/session/route.ts`
- `app/api/thank-you/complete/route.ts`

## Webhook Flow

```
Stripe event fires
  → POST /api/billing/webhook
  → Verify Stripe signature
  → Check stripe_webhook_events for duplicate (idempotency)
  → Insert stripe_event_id → stripe_webhook_events
  → Process event (update subscriptions table)
```

**Handled events** (inspect `app/api/billing/webhook/route.ts` for current list):
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.payment_succeeded`

**Key rule**: Always check `stripe_webhook_events` before processing. Never process the same `stripe_event_id` twice.

## Subscription Status States

```
incomplete → active
trialing → active
active → past_due → (active | canceled)
active → canceled
```

See migration `202603100002` for the full expanded status enum.

## Upgrade Flow

Separate from the initial checkout:
- `app/api/billing/upgrade-checkout/route.ts` — creates upgrade session
- `app/api/billing/upgrade-preview/route.ts` — previews proration
- `app/upgrade/page.tsx` — upgrade UI

## Customer Portal

Self-service billing management:
- `app/api/billing/portal/route.ts` — creates Stripe portal session
- Accessible from `/billing`

## Entitlements

Plan features are enforced server-side via `lib/entitlements.ts`.
- Never trust client-side plan claims
- Always call `getEntitlements(userId)` server-side before gating features
- Plan definitions: `lib/package-plans.ts`
- Entitlement mapping: `lib/plan-entitlements.ts`

## stripe_customer_id

- Must exist in `subscriptions` before any checkout or portal session
- Created by Stripe on first checkout; stored via webhook
- Foreign key between `profiles` and Stripe customer object

## Admin Payment Links

Admins can generate payment links for specific customers:
- `app/admin/payment-links/` — admin UI
- `app/api/admin/payment-links/` — API
- Migration: `202603160001`
