# Customer signup flow – audit

This document traces the **new customer signup flow** (guest checkout: no account → pay → set password → dashboard → Training Vault) and records what the code does, where it can break, and what to fix.

---

## Intended flow (step by step)

| Step | Actor | Action | Expected outcome |
|------|--------|--------|-------------------|
| 1 | Visitor | Lands on `/pricing` | Sees plans; not logged in. |
| 2 | Visitor | Clicks e.g. "Start Subscription" (Starter) | `CheckoutNowButton` sends `POST /api/billing/checkout` with `{ plan: "starter" }`. No auth. |
| 3 | Checkout API | Handles request | `isGuestCheckout = !!body.plan && (userError \|\| !user)` → true. Creates Stripe Checkout session with `success_url: {baseUrl}/welcome?session_id={CHECKOUT_SESSION_ID}`, `metadata: { plan, creator_id (service), no subscriber_id }`. Returns `session.url`. |
| 4 | Browser | Redirects to Stripe Checkout | User enters payment and pays. |
| 5 | Stripe | Redirects to app | `GET /welcome?session_id=cs_xxx`. |
| 6 | Stripe (async) | Sends webhooks | `checkout.session.completed` then `customer.subscription.created`. |
| 7 | Webhook `checkout.session.completed` | Creates account | No `subscriber_id` in metadata (guest). Creates Auth user (or finds existing by email), upserts profile: `stripe_customer_id`, `onboarding_pending: true`, `role: "creator"`. Does **not** insert `subscriptions` row. |
| 8 | Webhook `customer.subscription.created` | Links subscription | Resolves `subscriber_id` via `profiles.stripe_customer_id` (no `subscriber_id` in metadata). Upserts `subscriptions` with `creator_id`, `subscriber_id`, `stripe_subscription_id`, etc. |
| 9 | User on `/welcome` | Page loads | Client calls `GET /api/welcome/session?session_id=...`. API retrieves Stripe session, checks paid, returns `email`. Form shows with email pre-filled. |
| 10 | User | Submits password + optional display name | Client calls `POST /api/welcome/complete` with `session_id`, `email`, `password`, `displayName`. |
| 11 | Welcome complete API | Validates and updates | Verifies session paid, email matches session, finds Auth user by email. Updates password via `supabaseAdmin.auth.admin.updateUserById`, updates `profiles.full_name` if displayName provided. Returns `{ ok: true }`. |
| 12 | Client | Signs in and redirects | `supabase.auth.signInWithPassword({ email, password })` then `window.location.replace("/start")`. |
| 13 | User on `/start` | Sees dashboard | Stats (posts, subscriptions) and "Open Training Vault" link. |
| 14 | User | Clicks "Open Training Vault" | Navigates to `/vault`. |
| 15 | Vault page | Checks access | User exists, not suspended. `getUserRole` → `"creator"` (set in webhook). Renders `VaultClient`. |

---

## Where the code lives

| Step | File(s) |
|------|--------|
| 2–3 | `app/pricing/CheckoutNowButton.tsx`, `app/api/billing/checkout/route.ts` |
| 5 | Stripe redirect URL from checkout (no app route; Next serves `/welcome`). |
| 6–8 | `app/api/billing/webhook/route.ts` |
| 9 | `app/welcome/page.tsx`, `app/api/welcome/session/route.ts` |
| 10–12 | `app/welcome/page.tsx`, `app/api/welcome/complete/route.ts` |
| 13–15 | `app/start/page.tsx`, `app/vault/page.tsx`, `lib/roles.ts` |

---

## Gaps and bugs (why things “don’t work or get worse”)

### 1. Race: Welcome before webhook (high impact)

**What happens:** User pays and is redirected to `/welcome?session_id=...` immediately. They can submit the form before `checkout.session.completed` has run. The complete API looks up the user by email; the user does not exist yet → **"No account found for this email"**.

**Evidence:** `app/api/welcome/complete/route.ts` does `listUsers` and `find(u => email match)`. If webhook hasn’t created the user, `authUser` is undefined and the API returns 400.

**Fix:**  
- Either: in welcome UI, after loading session email, poll or retry “Complete” with a short delay and user-friendly message (“Setting up your account…”) until the backend finds the user.  
- Or: in complete API, if “No account found”, return a retryable error (e.g. 503) and have the client retry a few times with backoff.

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

### 3. `onboarding_pending` never cleared (medium / correctness)

**What happens:** Webhook sets `onboarding_pending: true`. The migration comment says “clear after /welcome complete”. The welcome complete API does **not** set `onboarding_pending: false`.

**Evidence:** `app/api/welcome/complete/route.ts` updates `profiles` only with `full_name`. No `onboarding_pending`.

**Fix:** In welcome complete, after updating password and name, update profile: `onboarding_pending: false`.

---

### 4. Vault: elevating subscriber to creator (medium / robustness)

**What happens:** If a user has an active subscription but `profiles.role` is still `consumer`, the vault page calls `setUserRole(supabase, user.id, "creator")` using the **user-scoped** Supabase client (cookies). If RLS does not allow authenticated users to update their own `profiles.role`, the update fails. The page still sets `role = "creator"` in memory and renders the vault, so they get in once. On the next load, DB still has `consumer` → they may be sent to onboarding/creator again.

**Evidence:** `app/vault/page.tsx` uses `createClient()` (user context) and `setUserRole(supabase, user.id, "creator")`. No migrations in repo show RLS for `profiles` table; if the default is deny, the update fails.

**Fix:** When elevating a subscriber to creator on the vault page, use **admin** (service role) to update `profiles.role`, so the outcome does not depend on RLS for `profiles`.

---

### 5. `NEXT_PUBLIC_APP_URL` (configuration)

**What happens:** Checkout builds `success_url` as `${baseUrl}/welcome?session_id=...` where `baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.url.origin ?? "http://localhost:3000"`. If `NEXT_PUBLIC_APP_URL` is wrong or missing in production, users can be sent to the wrong domain or path after payment.

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
    E --> F[Stripe session success_url=/welcome]
    F --> G[Return session.url]
  end
  G --> H[Stripe Checkout]
  H --> I[Pay]
  I --> J[Redirect /welcome?session_id=...]
  I --> K[Stripe webhooks]
  K --> L[checkout.session.completed]
  L --> M[Create user + profile role=creator]
  K --> N[customer.subscription.created]
  N --> O[Resolve subscriber_id via stripe_customer_id]
  O --> P[Upsert subscriptions]
  J --> Q[GET /api/welcome/session]
  Q --> R[Show form email]
  R --> S[POST /api/welcome/complete]
  S --> T{User exists?}
  T -->|No race| U[Update password + profile]
  T -->|Race| V[Error: No account found]
  U --> W[Client signIn + redirect /start]
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
2. **Welcome race** – Add retry or “setting up your account” handling so completing the form before the webhook doesn’t show a dead “No account found” error.  
3. **Welcome complete** – Set `onboarding_pending: false` when the user completes the welcome step.  
4. **Vault creator elevation** – Use admin client to set `profiles.role` to `creator` when allowing a subscriber into the vault, so RLS cannot block it.  
5. **Config** – Document and verify `NEXT_PUBLIC_APP_URL` (and Stripe webhook URL) in production.

---

## Summary

The intended path (pricing → Stripe → welcome → start → vault) is implemented, but:

- A **race** between redirect and webhook can make “Complete” fail with “No account found”.
- **Plan resolution** uses only env vars while checkout stores price IDs in app_settings, so entitlements and revenue can be wrong or missing.
- **onboarding_pending** is never cleared after welcome.
- **Vault** may rely on a role update that RLS could block, causing inconsistent access.

Fixing the four code items above (and checking config) should make the flow behave consistently and match how “every website” handles signup and first use.
