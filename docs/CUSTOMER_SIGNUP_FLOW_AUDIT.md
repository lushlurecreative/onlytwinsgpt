# Customer signup flow – audit

This document traces the **new customer signup flow** (guest checkout: no account → pay → set password → dashboard → Training Vault) and records what the code does, where it can break, and what to fix.

---

## Intended flow (step by step)

| Step | Actor | Action | Expected outcome |
|------|--------|--------|-------------------|
| 1 | Visitor | Lands on `/pricing` | Sees plans; not logged in. |
| 2 | Visitor | Clicks e.g. "Start Subscription" (Starter) | `CheckoutNowButton` sends `POST /api/billing/checkout` with `{ plan: "starter" }`. No auth. |
| 3 | Checkout API | Handles request | `isGuestCheckout = !!body.plan && (userError \|\| !user)` → true. Creates Stripe Checkout session with `success_url: https://onlytwins.dev/thank-you?sid={CHECKOUT_SESSION_ID}`, `metadata: { plan, creator_id (service), no subscriber_id }`. Returns `session.url`. |
| 4 | Browser | Redirects to Stripe Checkout | User enters payment and pays. |
| 5 | Stripe | Redirects to app | `GET /thank-you?sid=cs_xxx` then middleware redirects to clean `/thank-you`. |
| 6 | Stripe (async) | Sends webhooks | `checkout.session.completed` then `customer.subscription.created`. |
| 7 | Webhook `checkout.session.completed` | Creates account | No `subscriber_id` in metadata (guest). Creates Auth user (or finds existing by email), upserts profile: `stripe_customer_id`, `onboarding_pending: true`, `role: "creator"`. Does **not** insert `subscriptions` row. |
| 8 | Webhook `customer.subscription.created` | Links subscription | Resolves `subscriber_id` via `profiles.stripe_customer_id` (no `subscriber_id` in metadata). Upserts `subscriptions` with `creator_id`, `subscriber_id`, `stripe_subscription_id`, etc. |
| 9 | User on `/thank-you` | Page loads | Client calls `GET /api/thank-you/session`. API retrieves Stripe session, checks paid/readiness, and returns `state`. |
| 10 | User | Authenticates | If state is `ready`, user authenticates via Google OAuth or magic link. |
| 11 | Thank-you session API | Validates and reports state | Verifies session from `sid` query/cookie and returns `state` plus diagnostics. |
| 12 | Client | Redirects | On authenticated session, client redirects to `/dashboard` (alias to `/start`). |
| 13 | User on `/start` | Sees dashboard | Stats (posts, subscriptions) and "Open Training Vault" link. |
| 14 | User | Clicks "Open Training Vault" | Navigates to `/vault`. |
| 15 | Vault page | Checks access | User exists, not suspended. `getUserRole` → `"creator"` (set in webhook). Renders `VaultClient`. |

---

## Where the code lives

| Step | File(s) |
|------|--------|
| 2–3 | `app/pricing/CheckoutNowButton.tsx`, `app/api/billing/checkout/route.ts` |
| 5 | Stripe redirect URL from checkout (Next serves `/thank-you`). |
| 6–8 | `app/api/billing/webhook/route.ts` |
| 9 | `app/thank-you/page.tsx`, `app/api/thank-you/session/route.ts` |
| 10–12 | `app/thank-you/page.tsx`, `app/dashboard/page.tsx` |
| 13–15 | `app/start/page.tsx`, `app/vault/page.tsx`, `lib/roles.ts` |

---

## Gaps and bugs (why things “don’t work or get worse”)

### 1. Race: Thank-you before webhook (high impact)

**What happens:** User pays and is redirected to `/thank-you?sid=...` immediately. The thank-you page can load before `checkout.session.completed` has run, so state remains `processing` until webhook provisioning is done.

**Evidence:** `app/api/thank-you/session/route.ts` returns `processing` with reason `auth_user_not_ready` until webhook-created user/profile are present.

**Fix:**  
Keep polling state in thank-you UI until ready, and only expose auth actions once state is ready.

---

### 2. Plan key from price ID: env vs app_settings (high impact)

**What happens:** Checkout creates Stripe prices and stores them in **app_settings** (`getOrCreatePriceIdForPlan` in checkout: key `stripe_price_${plan}`, value = Stripe price id). The webhook and entitlements use **`getPlanKeyForStripePriceId(priceId)`**, which only checks **env vars** (`STRIPE_PRICE_ID_STARTER`, etc.). If those env vars are not set (and prices exist only in app_settings), `getPlanKeyForStripePriceId` returns `null`.

**Consequences:**  
- Webhook: `planKey` null → `amountCents` 0 → revenue_events may be wrong or skipped.  
- `GET /api/me/entitlements`: returns “No plan entitlements found. If you just purchased, wait 1–2 minutes…”. Vault/entitlements-driven UI can break.

**Evidence:**  
- `app/api/billing/checkout/route.ts`: `getOrCreatePriceIdForPlan` reads/writes `app_settings`.  
- `lib/plan-entitlements.ts`: `getPlanKeyForStripePriceId` only uses `process.env[PRICE_ID_ENV_BY_PLAN[k]]`.

**Fix:** Resolve plan from app_settings when env lookup fails: e.g. for each plan key, read `app_settings` key `stripe_price_${plan}` and compare to `priceId`; or store `plan` in subscription metadata and use it for entitlements.

---

### 3. `onboarding_pending` lifecycle (medium / correctness)

**What happens:** Webhook sets `onboarding_pending: true`; lifecycle clearing should happen as part of post-payment account setup completion.

**Evidence:** `profiles.onboarding_pending` is populated by webhook provisioning and now gated through the thank-you readiness API.

**Fix:** Keep readiness and profile lifecycle checks aligned in webhook/session flow.

---

### 4. Vault: elevating subscriber to creator (medium / robustness)

**What happens:** If a user has an active subscription but `profiles.role` is still `consumer`, the vault page calls `setUserRole(supabase, user.id, "creator")` using the **user-scoped** Supabase client (cookies). If RLS does not allow authenticated users to update their own `profiles.role`, the update fails. The page still sets `role = "creator"` in memory and renders the vault, so they get in once. On the next load, DB still has `consumer` → they may be sent to onboarding/creator again.

**Evidence:** `app/vault/page.tsx` uses `createClient()` (user context) and `setUserRole(supabase, user.id, "creator")`. No migrations in repo show RLS for `profiles` table; if the default is deny, the update fails.

**Fix:** When elevating a subscriber to creator on the vault page, use **admin** (service role) to update `profiles.role`, so the outcome does not depend on RLS for `profiles`.

---

### 5. `NEXT_PUBLIC_APP_URL` (configuration)

**What happens:** Checkout builds `success_url` as `https://onlytwins.dev/thank-you?sid={CHECKOUT_SESSION_ID}`. If domain configuration is wrong in production, users can be sent to the wrong host.

**Fix:** Ensure production (e.g. Vercel) has `NEXT_PUBLIC_APP_URL` set to the canonical app URL (e.g. `https://onlytwins.dev`).

---

### 6. One-time payment (`single_batch`) (already correct)

**What happens:** For `single_batch`, Stripe session is `mode: "payment"`. There is no subscription, so `customer.subscription.created` never fires. The **subscriptions** table never gets a row for that customer. The webhook still runs `checkout.session.completed` and creates/updates user and profile with `role: "creator"`. Vault allows access by `role === "creator"`. So one-time buyers still get vault access; no change needed for this flow.

---

## Flow diagram (code path)

```mermaid
flowchart TD
  subgraph visitor [Visitor]
    A[Pricing page] --> B[Click plan]
    B --> C[POST /api/billing/checkout plan]
  end
  subgraph checkout [Checkout API]
    C --> D{User?}
    D -->|No| E[Guest checkout]
    E --> F[Stripe session success_url=/thank-you?sid]
    F --> G[Return session.url]
  end
  G --> H[Stripe Checkout]
  H --> I[Pay]
  I --> J[Redirect /thank-you?sid=...]
  I --> K[Stripe webhooks]
  K --> L[checkout.session.completed]
  L --> M[Create user + profile role=creator]
  K --> N[customer.subscription.created]
  N --> O[Resolve subscriber_id via stripe_customer_id]
  O --> P[Upsert subscriptions]
  J --> Q[GET /api/thank-you/session]
  Q --> R{State ready?}
  R -->|No| V[Show processing]
  R -->|Yes| S[Google or magic link auth]
  S --> W[Client redirect /dashboard]
  W --> X[Start page]
  X --> Y[Click Open Training Vault]
  Y --> Z[/vault]
  Z --> AA{Role creator or has subscription?}
  AA -->|Yes| AB[VaultClient]
  AA -->|No| AC[Redirect /onboarding/creator]
```

---

## Recommended fix order

1. **Plan key resolution** – Make `getPlanKeyForStripePriceId` (or a shared resolver) use app_settings when env vars are missing, so entitlements and revenue work for dynamically created prices.  
2. **Thank-you readiness race** – Keep state polling and diagnostics visible until webhook provisioning completes.  
3. **Onboarding lifecycle** – Keep `onboarding_pending` semantics aligned with post-payment setup completion.  
4. **Vault creator elevation** – Use admin client to set `profiles.role` to `creator` when allowing a subscriber into the vault, so RLS cannot block it.  
5. **Config** – Document and verify `NEXT_PUBLIC_APP_URL` (and Stripe webhook URL) in production.

---

## Summary

The intended path (pricing → Stripe → thank-you → dashboard/start → vault) is implemented, but:

- A **race** between redirect and webhook can leave the page in processing until provisioning finishes.
- **Plan resolution** uses only env vars while checkout stores price IDs in app_settings, so entitlements and revenue can be wrong or missing.
- **onboarding_pending** lifecycle still needs explicit production verification against final setup completion semantics.
- **Vault** may rely on a role update that RLS could block, causing inconsistent access.

Fixing the four code items above (and checking config) should make the flow behave consistently and match how “every website” handles signup and first use.
