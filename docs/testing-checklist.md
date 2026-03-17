# Testing Checklist

Run the relevant sections after any meaningful change. Run the full checklist after billing, auth, or generation changes.

---

## 1. Admin login routing

**Goal:** Admin user lands at `/admin` after login, never sees customer shell.

Steps:
1. Log out completely (visit `/logout`)
2. Visit `/login`, sign in with an email in `ADMIN_OWNER_EMAILS`
3. **Expected:** redirected to `/admin` after login
4. Visit `/dashboard` directly
5. **Expected:** redirected to `/admin`
6. Visit `/vault` directly
7. **Expected:** redirected to `/admin`
8. Confirm admin nav shows: Dashboard, Customers, Leads, Billing / Revenue, Log out
9. Confirm no customer nav (no subscription CTA, no vault link)

---

## 2. Customer login

**Goal:** Customer lands at `/dashboard` after login, never sees admin shell.

Steps:
1. Log out (visit `/logout`)
2. Visit `/login`, sign in with a non-admin account
3. **Expected:** redirected to `/dashboard` (or `/onboarding` if `onboarding_pending = true`)
4. Visit `/admin` directly
5. **Expected:** redirected to `/dashboard?unauthorized=admin`
6. Confirm customer nav visible, no admin nav

---

## 3. Subscription checkout

**Goal:** Customer completes Stripe checkout, subscription provisioned, account active.

Steps:
1. As a logged-in customer, visit `/pricing`
2. Click subscribe on any plan
3. **Expected:** redirected to Stripe hosted checkout
4. Complete checkout with Stripe test card `4242 4242 4242 4242`
5. **Expected:** redirected to `/thank-you`
6. Check `subscriptions` table in Supabase — new row with `status = 'active'`
7. Check `profiles` — `stripe_customer_id` set, `onboarding_pending = true`
8. Check `stripe_webhook_events` — `checkout.session.completed` event present and `processed_at` set

---

## 4. Webhook sync

**Goal:** Stripe events write to DB correctly and idempotently.

Steps:
1. In Stripe Dashboard → Webhooks, find the recent `checkout.session.completed` event
2. Click "Resend" to replay the event
3. **Expected:** returns 200, no duplicate subscription row created
4. Check `stripe_webhook_events` — only one row for this `stripe_event_id`
5. Simulate `invoice.payment_failed` via Stripe test events
6. **Expected:** subscription status updates to `past_due` in DB
7. **Expected:** `revenue_events` has a negative amount entry
8. **Expected:** `system_events` has `stripe_invoice_payment_failed` entry

---

## 5. Request mix save

**Goal:** Customer saves generation preferences, batch is queued.

Steps:
1. Log in as customer with active subscription and >= 10 training photos uploaded
2. Visit `/requests`
3. Add at least one photo request line with a prompt and quantity
4. Click Save
5. **Expected:** success message — either "queued" or "saved for next cycle"
6. If `GENERATION_ENGINE_ENABLED=true`: check `generation_requests` table — new row with `status = 'pending'` or `'generating'`
7. Check `generation_request_lines` — rows for each mix line
8. Check `recurring_request_mixes` — row for the target cycle
9. Check `app_settings` — `request_mix:{userId}` key updated

---

## 6. Generation queue

**Goal:** Pending generation requests are picked up and jobs are dispatched.

Steps (requires `GENERATION_ENGINE_ENABLED=true` and RunPod configured):
1. Ensure a `generation_requests` row exists with `status = 'pending'`
2. Manually trigger `/api/cron/process-customer-generation` (with correct `CRON_SECRET` in Authorization header)
3. **Expected:** 200 response with `{ok: true, processed: [...]}`
4. Check `generation_requests` — status changed to `generating` or `completed`/`failed`
5. If failed: check `admin_notes` column for reason
6. Check `generation_jobs` — rows created with `runpod_job_id`
7. Check `system_events` — `customer_generation_processor_run` event logged

---

## 7. Library delivery

**Goal:** Completed generation results appear in customer vault.

Steps (requires RunPod worker to complete jobs):
1. Wait for RunPod jobs to complete (or simulate via `/api/webhooks/runpod`)
2. Log in as the customer who owns the request
3. Visit `/vault`
4. **Expected:** generated images visible
5. Check `generation_jobs` — `status = 'completed'`, `result_path` set
6. Check `generation_requests` — `status = 'completed'`, `completed_at` set

---

## 8. Admin customer payment links

**Goal:** Admin creates a payment link, customer pays, account is provisioned.

Steps:
1. Log in as admin, visit `/admin/leads` or `/admin/customers`
2. Find the payment links section, create a link for a test email + plan
3. **Expected:** Stripe checkout URL generated and copyable
4. Open the URL in an incognito window (as the recipient)
5. Complete Stripe checkout
6. **Expected:** `/thank-you` page loads
7. Check Supabase `auth.users` — new user created for the email
8. Check `profiles` — `stripe_customer_id` set, `onboarding_pending = true`, `role = 'creator'`
9. Check `subscriptions` — active subscription row
10. Check `admin_payment_links` — row with `stripe_checkout_session_id` set
11. Check `stripe_webhook_events` — event locked and processed

---

## 9. Logout

**Goal:** Logout clears session, user cannot access protected routes.

Steps:
1. While logged in, visit `/logout`
2. **Expected:** redirected to `/`
3. Visit `/dashboard`
4. **Expected:** redirected to `/login?redirectTo=/dashboard`
5. Visit `/admin` (if was admin)
6. **Expected:** redirected to `/login?redirectTo=/admin`
7. Confirm session cookie is cleared (DevTools → Application → Cookies)

---

## Regression checks for any billing change

After any change to `app/api/billing/`:
- [ ] Run tests 3, 4, 8 above
- [ ] Confirm no change to idempotency logic in webhook
- [ ] Confirm `subscriptions_status_check` constraint still satisfied (allowed: `active`, `trialing`, `past_due`, `canceled`, `expired`, `incomplete`, `needs_review`)
- [ ] Confirm `stripe_customer_id` is still written correctly to `profiles`

## Regression checks for any auth change

After any change to `proxy.ts`, `lib/admin.ts`, `app/auth/callback/`, or `app/admin/layout.tsx`:
- [ ] Run tests 1, 2, 9 above
- [ ] Confirm admin cannot access customer routes
- [ ] Confirm customers cannot access `/admin`
- [ ] Confirm unauthenticated users are redirected to `/login` with correct `redirectTo`

## Regression checks for any generation change

After any change to `lib/customer-generation.ts`, `lib/customer-generation-processor.ts`, or generation cron routes:
- [ ] Run tests 5, 6, 7 above
- [ ] Confirm `GENERATION_ENGINE_ENABLED` gate is respected
- [ ] Confirm idempotency keys prevent duplicate batches
- [ ] Confirm mix save respects plan allowance limits
