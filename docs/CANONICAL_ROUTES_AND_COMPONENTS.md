# Canonical Routes & Components

Authoritative list of current customer/admin routes, the canonical post-subscription flow, and the one-true content destination. If a route is not listed here as canonical, do not link to it, redirect to it, or build on it. Update this file whenever a canonical route changes.

See `docs/ARCHITECTURE.md` for the full system map. This doc is only the "use this, not that" index.

---

## 1. Canonical customer routes

| Route | Purpose | Sole client / notes |
|---|---|---|
| `/` | Marketing landing | `app/HomeClient.tsx` |
| `/login` | Email/magic-link login | — |
| `/thank-you` | Post-Stripe-checkout landing; polls `/api/thank-you/session` until webhook completes | `app/thank-you/page.tsx` |
| `/start` | Authed entry shim → `/admin` or `/dashboard` | Redirect only |
| `/dashboard` | Subscriber home | `app/dashboard/DashboardClient.tsx` |
| `/onboarding/intake` | Post-subscription guided setup wizard | Gated by `requireActiveSubscriber` |
| `/upload` | Training photo upload | `app/upload/UploadClient.tsx` |
| `/requests` | Recurring generation preferences | `app/requests/RequestsClient.tsx` |
| `/library` | **Canonical content destination** — generated images/videos | `app/library/LibraryClient.tsx` |
| `/me` | Subscription status + account | `app/me/page.tsx` |
| `/billing/portal` | Stripe customer portal redirect | — |
| `/logout` | Signs out | — |

## 2. Canonical admin routes

Admins are redirected to `/admin` by `proxy.ts` and `app/admin/layout.tsx`. Admins must never see the customer shell.

| Route | Purpose |
|---|---|
| `/admin` | Admin home / ops health |
| `/admin/customers` (+ `/[workspaceId]`) | Customer management |
| `/admin/leads` | Lead pipeline |
| `/admin/subscriptions` | Subscription state |
| `/admin/revenue` | Revenue + billing |
| `/admin/worker`, `/admin/generation-queue` | Worker + queue ops |
| `/admin/webhook-events`, `/admin/webhook-health` | Stripe/webhook audit |
| `/admin/settings`, `/admin/entitlements` | Plans, price IDs, entitlements |
| `/admin/diagnostics`, `/admin/alerts`, `/admin/kpis`, `/admin/cohorts`, `/admin/churn-risk`, `/admin/cost`, `/admin/posts`, `/admin/creators`, `/admin/creator-kpis`, `/admin/automation`, `/admin/user-reset`, `/admin/watermark`, `/admin/subscription-health` | Operational tools |

Admin detection: `lib/admin.ts::isAdminUser()`. Never hand-roll email checks.

## 3. Canonical onboarding flow

```
/onboarding/profile      → initial profile (name, role hints)
/onboarding/intake       → post-subscription guided setup (REQUIRES active subscription)
/onboarding/creator      → role self-elevation to creator (optional)
/onboarding/consumer     → fan/consumer mode (optional, non-subscriber branch)
```

`/onboarding/intake` is the canonical post-payment setup wizard. The others are role-specific branches.

## 4. Canonical post-subscription flow

```
Stripe Checkout
  → webhook (app/api/billing/webhook) writes profile + subscription
  → /thank-you (polls /api/thank-you/session until state=ready)
  → user logs in
  → /dashboard
  → /onboarding/intake   (gated by requireActiveSubscriber)
  → /upload              (training photos)
  → /requests            (recurring generation mix)
  → /library             (content appears here)
```

Every gated subscriber route uses `lib/require-active-subscriber.ts`. Do not roll ad-hoc subscription checks.

## 5. Canonical library / content destination

**`/library` is the only canonical destination for generated customer content.**

- Served by `app/library/page.tsx` + `app/library/LibraryClient.tsx`
- Gated by `requireActiveSubscriber("/library")`
- All generation pipeline outputs (cron, RunPod worker, manual) must surface here

Do not introduce a second content surface. If a new view is needed, add a tab inside `LibraryClient.tsx`.

## 6. Important shared components

| Component | Used by | Notes |
|---|---|---|
| `components/SiteShell.tsx` | Customer routes only | Never mount inside `/admin` |
| `components/PrimaryNav.tsx`, `AuthNav.tsx`, `HeaderSubscriptionCta.tsx` | Customer shell nav | — |
| `app/admin/AdminNav.tsx`, `AdminHomeClient.tsx`, `AdminGlobalHealth.tsx` | Admin shell only | Never mount in customer routes |
| `proxy.ts` | All routes | Single auth/admin/redirect enforcement point |
| `lib/admin.ts` | Admin gating | `isAdminUser()` is the only admin check |
| `lib/require-active-subscriber.ts` | `/library`, `/onboarding/intake`, and other subscriber-gated pages | Only subscription gate |
| `lib/roles.ts` | `/vault`, creator flows | `getUserRole`, `isSuspended` |
| `components/UploadGate.tsx` | `/upload` | — |

## 7. Deprecated / non-canonical routes — do not use

| Route | Status | Use instead |
|---|---|---|
| `/training-vault` | Redirects to `/dashboard`. Do not link. | `/library` for content; `/upload` for photos |
| `/vault` | Legacy **creator-role** surface (not the subscriber content library). Do not link from subscriber flows. | `/library` |
| `/gallery` | Marketing-only capabilities showcase. Static. Not user content. | `/library` for user content |
| `/feed` | Social/creator feed (separate product surface). Not the subscriber content library. | `/library` for subscriber content |
| `/results` | Marketing preview for guests; authed users redirect to `/library`. Never link authed users here. | `/library` |
| `/welcome` | Empty stub folder. Do not link. | `/thank-you` for post-payment landing |
| `/training/photos` | Legacy upload surface. Do not link from new flows. | `/upload` |
| `/creator`, `/creators`, `/subjects` | Legacy / marketing surfaces — not part of the canonical subscriber flow | — |
| `/supabase-test`, `/market-ad-hoc`, `/book-call` | Test / ad-hoc marketing. Not production flow. | — |

## 8. "Use this, not that" — recurring drift

- **Content destination** → `/library`, not `/vault`, `/training-vault`, `/gallery`, or `/feed`.
- **Post-payment landing** → `/thank-you`, not `/welcome`.
- **Authed entry** → `/start` (it routes admin vs subscriber), not hand-rolled `if admin` logic.
- **Training photo upload** → `/upload`, not `/training/photos`.
- **Post-subscription setup** → `/onboarding/intake`, not a new wizard route.
- **Admin detection** → `lib/admin.ts::isAdminUser`, not ad-hoc email checks.
- **Subscriber gating** → `lib/require-active-subscriber.ts`, not ad-hoc `subscriptions` queries.
- **Admin nav** → `app/admin/AdminNav.tsx`, never `PrimaryNav`/`SiteShell`.
