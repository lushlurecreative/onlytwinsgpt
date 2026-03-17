# Auth Flow

## Overview

Supabase Auth with cookie-based sessions (`@supabase/ssr`). All routing enforcement happens in `proxy.ts`. Admin detection is email-based.

## Login flow

```
1. User visits /login
2. Submits credentials
3. Supabase Auth issues session cookie
4. Redirect to /auth/callback
5. app/auth/callback/page.tsx (client component):
   a. Gets session via supabase.auth.getSession()
   b. POST /api/thank-you/complete (marks onboarding if needed)
   c. GET /api/admin/session → {isAdmin: bool}
   d. isAdmin → router.replace('/admin')
      else → router.replace(next) where next defaults to '/dashboard'
```

**Key files:**
- `app/login/` — login UI
- `app/auth/callback/page.tsx` — OAuth callback (client component)
- `app/api/admin/session/route.ts` — returns `{isAdmin: bool}` for the current session

## Logout flow

```
User clicks logout (AdminNav links to /logout)
→ app/logout/ page clears Supabase session
→ redirects to /
```

**Key file:** `app/logout/`

## Middleware routing (`proxy.ts`)

Runs on every non-static request.

| Condition | Result |
|---|---|
| Any request | Security headers applied |
| `GET /?code=...` | Redirect to `/auth/callback?code=...&next=/dashboard` |
| `GET /welcome?sid=` or `/thank-you?sid=` | Set `ot_checkout_sid` cookie, redirect to `/thank-you` |
| `GET /login` | Rate limit check by IP |
| Customer route + authenticated admin | `redirect('/admin')` |
| `/upload` or `/admin/**` + no session | `redirect('/login?redirectTo=<path>')` |
| Everything else | Pass through |

**Customer routes** (admins redirected away from):
`/`, `/dashboard`, `/vault`, `/billing`, `/me`, `/requests`, `/subjects`, `/creator`, `/library`, `/training-vault`, `/upload`, `/onboarding/**`

**Protected routes** (require session):
`/upload`, `/admin/**`

## Admin detection

`lib/admin.ts` → `isAdminUser(userId, email)`:
```ts
// Checks ADMIN_OWNER_EMAILS env var (comma-separated, lowercase comparison)
// Falls back to hardcoded "lush.lure.creative@gmail.com" if env var not set
getAdminOwnerEmails().includes(email.toLowerCase())
```

Called in:
- `proxy.ts` — before serving any customer route
- `app/admin/layout.tsx` — server-side on every admin page load
- `app/auth/callback/page.tsx` — via `/api/admin/session` to choose post-login destination

## Admin layout double-check (`app/admin/layout.tsx`)

Server component. Every admin page load runs:
```ts
if (!user) redirect('/login?redirectTo=/admin')
if (!isAdminUser(user.id, user.email)) redirect('/dashboard?unauthorized=admin')
```

This is defence-in-depth beyond `proxy.ts`.

## Supabase session clients

| File | Use case |
|---|---|
| `lib/supabase-server.ts` → `createClient()` | Server Components, API Route Handlers |
| `lib/supabase-admin.ts` → `getSupabaseAdmin()` | Admin ops, cron, webhooks, worker APIs (bypasses RLS) |
| `lib/supabase/client.ts` → `createClient()` | Client Components (browser) |

## Cookies

- `ot_checkout_sid` — httpOnly, secure, sameSite: lax, maxAge: 6h. Set by middleware when `sid` param is present on `/welcome` or `/thank-you`. Consumed by `/api/thank-you/session`.

## Security headers (applied to every response)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload  (production only)
```

## Rate limiting

- Login page: `checkRateLimit('auth-login-page:{ip}', RATE_LIMITS.authLoginPage.limit, RATE_LIMITS.authLoginPage.windowMs)`
- Checkout: `RATE_LIMITS.billingCheckout`
- Portal: `RATE_LIMITS.billingCheckout`
- Webhook: `RATE_LIMITS.billingWebhook`

Config in `lib/security-config.ts`. In-memory store via `lib/rate-limit.ts`.

## Before touching auth code

Read these files:
- `proxy.ts`
- `lib/admin.ts`
- `app/auth/callback/page.tsx`
- `app/admin/layout.tsx`
- `app/api/admin/session/route.ts`
- `app/logout/`
