# Bug: Onboarding Pending

Status: **Likely not a bug.** Code inspection shows the lifecycle is implemented correctly. Needs production verification.

## Expected behavior

1. `checkout.session.completed` webhook sets `profiles.onboarding_pending = true`
2. User completes post-payment setup
3. `POST /api/thank-you/complete` sets `profiles.onboarding_pending = false`

## Actual behavior

Code does implement both sides:
- Webhook sets `onboarding_pending: true` at `app/api/billing/webhook/route.ts` lines 300-309 (uses admin client)
- `/api/thank-you/complete` sets `onboarding_pending: false` at `app/api/thank-you/complete/route.ts` lines 18-21 (uses admin client)

The original known-issues doc said this was never cleared, but code inspection shows the clear path exists.

## Reproduction

1. Complete Stripe checkout as a new user
2. Webhook fires, creates profile with `onboarding_pending = true`
3. User lands on `/thank-you`, completes setup
4. Client calls `POST /api/thank-you/complete`
5. Check `profiles.onboarding_pending` — should be `false`

## Error message

None expected if working correctly.

## Affected files

- `app/api/billing/webhook/route.ts` (lines 300-309: sets `onboarding_pending: true`)
- `app/api/thank-you/complete/route.ts` (lines 18-21: sets `onboarding_pending: false`)
- `supabase/migrations/202602170014_profiles_onboarding_pending.sql` (adds column, default `false`)

## Confirmed facts

- Column defined with `default false` in migration `202602170014`
- Webhook sets it to `true` using admin client (bypasses RLS)
- `/api/thank-you/complete` sets it to `false` using admin client (bypasses RLS)
- No other code paths were found that read `onboarding_pending` to gate access

## Unverified assumptions

- Whether the thank-you page actually calls `POST /api/thank-you/complete` in the browser flow
- Whether any downstream route gates on `onboarding_pending` (grep found no such gates, but production behavior unverified)

## Things already tried

Nothing — code inspection only.

## Next single step

Run a production test: complete checkout as a new user, then query `SELECT onboarding_pending FROM profiles WHERE id = '<new-user-id>'` to confirm it transitions from `true` to `false`.
