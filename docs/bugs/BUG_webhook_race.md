# Bug: Webhook Race

## Expected behavior

After Stripe checkout, user account is fully provisioned (profile row + subscription row) before the user can access the dashboard.

## Actual behavior

Two separate Stripe webhook events create the workspace:

1. `checkout.session.completed` → upserts profile row (lines 300-309), conditionally upserts subscription row (lines 319-351, only if `stripeSubscriptionId && creatorId && subscriberId`)
2. `customer.subscription.created` → upserts subscription row (lines 478-489), upserts profile with `role: "creator"` (lines 471-474)

The thank-you session endpoint checks for both profile AND subscription before returning `state: "ready"` (lines 179-216), which mitigates the race for the normal flow. The race only triggers if the user bypasses the thank-you page AND `checkout.session.completed` didn't create the subscription row.

## Reproduction

1. Complete Stripe checkout (subscription plan)
2. `checkout.session.completed` fires → profile row created, subscription row may or may not be created
3. User bypasses thank-you polling (direct URL to `/dashboard`)
4. Dashboard finds no active subscription → "no active plan" or redirect to pricing

## Error message

None. Incorrect UI state.

## Affected files

- `app/api/billing/webhook/route.ts` (line 192: checkout handler, line 447: subscription handler)
- `app/api/thank-you/session/route.ts` (lines 179-216: checks profile then subscription)
- `app/api/me/entitlements/route.ts` (reads subscription for plan access)

## Confirmed facts

- Thank-you session endpoint checks for subscription row before returning ready — mitigates the race for normal flow
- `checkout.session.completed` attempts to create the subscription row in the same event (lines 319-351)
- `customer.subscription.created` is a separate Stripe event, typically fires seconds after checkout

## Unverified assumptions

- How often `checkout.session.completed` fails to create the subscription row (depends on `stripeSubscriptionId` presence)
- Whether any users bypass the thank-you page in practice
- Exact timing gap between the two webhook events in production

## Things already tried

- Subscription row check added to `/api/thank-you/session` (in place at lines 210-216)
- `checkout.session.completed` handler attempts subscription row creation directly (lines 319-351)

## Next single step

Check Stripe webhook logs: does `checkout.session.completed` consistently include `stripeSubscriptionId` for subscription checkouts? If yes, the race window is effectively closed for normal flows.
