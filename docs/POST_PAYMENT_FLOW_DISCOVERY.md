# Post-payment flow — discovery (Step 1)

Every file involved in the listed areas, with a short description of what it currently does. No code was modified.

---

## 1. Stripe checkout session creation

| File | What it does |
|------|----------------|
| **app/api/billing/checkout/route.ts** | POST handler. Rate-limits by IP; reads body (plan, optional creatorId, successUrl, cancelUrl, leadId). If `body.plan` and no auth → guest checkout. Resolves/create Stripe price via `getOrCreatePriceIdForPlan` (reads/writes app_settings). For plan checkout: builds success_url `{baseUrl}/welcome?session_id={CHECKOUT_SESSION_ID}`, cancel_url to pricing; metadata: plan, creator_id (service), optional subscriber_id (if logged in), optional lead_id. Creates Stripe checkout session (mode payment or subscription), returns `{ url: session.url }`. For creator subscription (no plan): requires auth, uses STRIPE_PRICE_ID and creatorId, success/cancel to feed/creator/{id}. |
| **app/pricing/CheckoutNowButton.tsx** | Client component. On click, POSTs to `/api/billing/checkout` with `{ plan }` (credentials: include). On 401 shows error; on success sets `window.location.href = data.url` to send user to Stripe Checkout. |
| **app/pricing/page.tsx** | Server page. Renders pricing cards and uses CheckoutNowButton (and BitcoinCheckoutButton) per plan. No redirect logic; public page. |
| **lib/package-plans.ts** | Defines PlanKey, PACKAGE_PLANS (name, mode, amountUsd), PRICE_ID_ENV_BY_PLAN. Used by checkout for price creation and by plan-entitlements. |
| **lib/service-creator.ts** | Provides service creator id (used as creator_id for plan-based checkout). Used by checkout and webhook. |
| **lib/stripe.ts** | Returns Stripe server instance (getStripe). Used by checkout, webhook, welcome session/complete. |
| **lib/supabase-server.ts** | Creates Supabase server client (cookies). Used by checkout to get current user for guest vs authenticated. |
| **lib/supabase-admin.ts** | Returns Supabase admin (service role) client. Used by checkout for app_settings and suspend check. |

---

## 2. Stripe webhook handler

| File | What it does |
|------|----------------|
| **app/api/billing/webhook/route.ts** | POST handler for Stripe webhooks. Rate-limits by IP; verifies signature with STRIPE_WEBHOOK_SECRET; locks by stripe_event_id in stripe_webhook_events (idempotency). Handles: (1) checkout.session.completed — creates/finds Auth user and profile when no subscriber_id (guest), upserts profile (stripe_customer_id, onboarding_pending, role creator), optionally calls convert_lead_to_customer RPC; (2) customer.subscription.created/updated/deleted — resolves creator_id/subscriber_id (metadata, then subscriptions row, then profiles by stripe_customer_id), upserts subscriptions, writes revenue_events, updates leads to converted when lead_id and active. Marks event processed. |
| **lib/plan-entitlements.ts** | getPlanKeyForStripePriceId(priceId) resolves plan from env vars only (PRICE_ID_ENV_BY_PLAN). Used by webhook for revenue_events and plan_key. |

---

## 3. Lead → customer conversion (including RPCs)

| File | What it does |
|------|----------------|
| **app/api/billing/webhook/route.ts** | When checkout.session.completed has lead_id and subscriber_id (or after creating/finding user for guest), calls supabaseAdmin.rpc("convert_lead_to_customer", p_lead_id, p_subscriber_id, p_creator_id, p_stripe_subscription_id, p_plan). Also on customer.subscription.created/updated, if lead_id and status active/trialing, updates leads set status=converted and inserts automation_events. |
| **supabase/migrations/202602170013_convert_lead_to_customer_rpc.sql** | Defines public.convert_lead_to_customer(p_lead_id, p_subscriber_id, p_creator_id, p_stripe_subscription_id, p_plan). Security definer. Updates leads set status='converted', updated_at=now(); inserts into automation_events (event_type 'converted', entity_type 'lead', entity_id lead_id, payload with stripe_subscription_id and subscriber_id). |

---

## 4. Supabase Auth user creation

| File | What it does |
|------|----------------|
| **app/api/billing/webhook/route.ts** | In checkout.session.completed when creatorId present and no subscriberId: gets customer email from session; calls supabaseAdmin.auth.admin.createUser(email, randomTempPassword(), email_confirm: true). On "already been registered" finds existing user by email and upserts profile instead. On success upserts profile (id, stripe_customer_id, onboarding_pending, role creator). No subscription row created here (that happens in customer.subscription.*). |
| **app/api/welcome/complete/route.ts** | Does not create users. Finds existing Auth user by email (listUsers, find by email); updates password via supabaseAdmin.auth.admin.updateUserById(authUser.id, { password }). Assumes user already exists (created by webhook). |

---

## 5. Workspace / customer creation

| File | What it does |
|------|----------------|
| **app/api/billing/webhook/route.ts** | “Workspace” in this codebase is the profile (and related rows) keyed by user id. Webhook creates/updates profile via supabaseAdmin.from("profiles").upsert({ id, stripe_customer_id, onboarding_pending, role: "creator" }). Subscription row is created in customer.subscription.created/updated by upserting into subscriptions (creator_id, subscriber_id, status, stripe_subscription_id, etc.). resolveSubscriptionParties uses profiles.stripe_customer_id to resolve subscriber_id when not in metadata. |
| **app/admin/customers/page.tsx** | Admin UI: lists “customers” (profiles/subscribers). Not part of post-payment creation; reads existing data. |
| **app/admin/customers/[workspaceId]/page.tsx** | Admin detail for one customer (workspaceId = user id). Server redirect to login if no user; fetches profile, subscriptions, subjects, briefs, posts for that user. |

---

## 6. Redirect logic (client or server)

| File | What it does |
|------|----------------|
| **app/api/billing/checkout/route.ts** | No HTTP redirect. Returns JSON `{ url }`; client redirects to Stripe. success_url and cancel_url are Stripe session params (baseUrl from NEXT_PUBLIC_APP_URL or request origin). |
| **app/pricing/CheckoutNowButton.tsx** | Client: on success `window.location.href = data.url` (Stripe Checkout). |
| **app/welcome/page.tsx** | Client: after successful POST /api/welcome/complete and signInWithPassword, `window.location.replace("/start")`. |
| **app/login/page.tsx** | Client: reads redirectTo from search params (default "/start"); after sign-in/sign-up calls doRedirect() → window.location.replace(redirectTo + query). |
| **app/thank-you/page.tsx** | Renders links only: “Continue to your dashboard” → /start if user, else /login?redirectTo=/start; “Back to OnlyTwins” → /. No automatic redirect. (This page is not the current success target; success_url points to /welcome.) |
| **app/start/page.tsx** | Server: if !user redirect("/login?redirectTo=/start"). |
| **app/vault/page.tsx** | Server: if !user redirect("/login?redirectTo=/vault"); if suspended redirect("/suspended"); if role not creator and no active subscription redirect("/onboarding/creator?from=vault"). |
| **app/onboarding/creator/page.tsx** | Server: if !user redirect("/login?redirectTo=/onboarding/creator"); if suspended redirect("/suspended"); if role === creator redirect("/vault"). |
| **app/onboarding/creator/BecomeCreatorClient.tsx** | Client: after PATCH /api/me/role (become creator) window.location.href = from === "creator" ? "/creator" : "/vault". |
| **app/checkout/page.tsx** | Server: redirect("/pricing"). |
| **app/admin/layout.tsx** | Server: if !user redirect("/login?redirectTo=/admin"). |
| **app/admin/page.tsx** | Server: redirect("/admin/leads"). |
| **app/api/billing/bitcoin/checkout/route.ts** | Builds redirect_url to login with redirectTo=/onboarding/creator?payment=success&method=bitcoin&plan=… (Bitcoin flow; separate from Stripe post-payment). |

---

## 7. /welcome page

| File | What it does |
|------|----------------|
| **app/welcome/page.tsx** | Client component. Reads session_id from search params. On load fetches GET /api/welcome/session?session_id=…; if ok sets email in state; if !ok sets sessionInvalid and error. Renders form: email (read-only), password, confirm password, display name. Submit POST /api/welcome/complete with session_id, email, password, displayName; on success calls supabase.auth.signInWithPassword then window.location.replace("/start"). Shows “Loading…”, “Invalid or expired link” (with link to pricing), or the form. |
| **app/api/welcome/session/route.ts** | GET. Requires session_id query. Retrieves Stripe checkout session (expand subscription). Requires payment_status === "paid" or subscription present; returns 400 otherwise. Returns JSON { email, customerId } from session. |
| **app/api/welcome/complete/route.ts** | POST. Body: session_id, email, password, displayName. Retrieves Stripe session; requires paid; requires session email to match body email. Finds Auth user by email (admin listUsers); returns 400 if no user. Updates user password (admin.updateUserById) and profile full_name if provided. Returns { ok: true }. Does not clear onboarding_pending. |

---

## 8. Middleware that affects auth or redirects

| File | What it does |
|------|----------------|
| **proxy.ts** | Exports async function proxy(request). Applies security headers. Rate-limits GET /login by IP. For paths under /upload or /admin, builds Supabase server client from cookies, get user; if protected and !user redirects to /login?redirectTo=pathname. Not named middleware.ts; no middleware.ts found in repo, so this proxy is only used if something else imports and invokes it (e.g. custom server or instrumentation). |

---

## 9. Dashboard redirect logic

| File | What it does |
|------|----------------|
| **app/start/page.tsx** | Dashboard for logged-in customer. Server: redirect to /login?redirectTo=/start if no user. Renders “Start Here”, stats, “Open Training Vault” link to /vault. |
| **app/vault/page.tsx** | Training Vault. Server: redirect to login if no user, to /suspended if suspended, to /onboarding/creator?from=vault if not creator and no active subscription; else allows in and can set role to creator if they have active subscription. |
| **app/login/page.tsx** | redirectTo defaults to "/start"; after sign-in redirects to redirectTo. |
| **app/thank-you/page.tsx** | Links to /start or /login?redirectTo=/start (no server redirect). |
| **app/admin/layout.tsx** | Redirect to /login?redirectTo=/admin if no user. |
| **app/admin/page.tsx** | Redirect to /admin/leads. |
| **app/admin/customers/page.tsx** | Redirect to /login?redirectTo=/admin/customers if no user. |
| **app/admin/customers/[workspaceId]/page.tsx** | Redirect to /login?redirectTo=/admin/customers/{workspaceId} if no user. |
| **app/admin/leads/page.tsx** | Redirect to /login?redirectTo=/admin/leads if no user. |

---

## Summary counts

- **Stripe checkout session creation:** 6 files (route, button, pricing page, package-plans, service-creator, stripe, supabase-server, supabase-admin — 8 if counting libs).
- **Stripe webhook handler:** 2 files (webhook route, plan-entitlements).
- **Lead → customer (RPC):** 2 files (webhook route, convert_lead_to_customer migration).
- **Supabase Auth user creation:** 2 files (webhook route, welcome/complete for password update only).
- **Workspace/customer creation:** webhook route + admin customer pages (read-only).
- **Redirect logic:** 12+ files (checkout response, CheckoutNowButton, welcome page, login, thank-you, start, vault, onboarding/creator, BecomeCreatorClient, checkout page, admin layout and pages, bitcoin checkout).
- **/welcome page:** 3 files (welcome/page.tsx, api/welcome/session, api/welcome/complete).
- **Middleware (auth/redirect):** 1 file (proxy.ts; no middleware.ts).
- **Dashboard redirects:** start, vault, login, thank-you, admin layout and admin pages.

End of discovery. No code was modified.
