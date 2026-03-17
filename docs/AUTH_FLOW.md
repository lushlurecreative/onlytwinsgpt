# Auth Flow

## Overview

Authentication is handled by Supabase Auth with cookie-based sessions. All routing enforcement happens in `proxy.ts` (middleware).

## Login Flow

```
User visits /login
  → Submits credentials (email/password or OAuth)
  → Supabase Auth issues session
  → Redirect to /auth/callback
  → Callback detects role via isAdminUser()
  → Admin → /admin
  → Customer → /dashboard (or /onboarding if pending)
```

**Key files**:
- `app/login/page.tsx`
- `app/auth/callback/page.tsx` (or route.ts)
- `lib/admin.ts` — `isAdminUser(userId, email)`

## Logout Flow

```
User clicks logout
  → GET/POST /logout or /api/auth/logout
  → Server clears Supabase session
  → Clears cookies
  → Redirects to /
```

**Key file**: `app/logout/page.tsx`, `app/api/auth/logout/route.ts`

## Middleware (`proxy.ts`) Route Logic

| Condition | Action |
|---|---|
| `/?code=...` | Redirect to `/auth/callback` (OAuth code exchange) |
| Unauthenticated + `/upload` | Redirect to `/login` |
| Unauthenticated + `/admin/**` | Redirect to `/login` |
| Authenticated admin + customer route | Redirect to `/admin` |
| Authenticated customer + `/admin/**` | Redirect to `/` |
| Authenticated + any other route | Allow through |

**Customer routes** (admins redirected away from these):
`/`, `/dashboard`, `/vault`, `/billing`, `/me`, `/requests`, `/subjects`, `/creator`, `/library`, `/training-vault`, `/upload`, `/onboarding/**`

## Admin Detection

`lib/admin.ts` → `isAdminUser(userId, email)`:
- Checks `ADMIN_OWNER_EMAILS` env var (comma-separated email list)
- Called in `proxy.ts` for every request to customer routes

## Supabase Session Clients

| File | Auth Method | Use Case |
|---|---|---|
| `lib/supabase-server.ts` | Cookie-based | Server Components, Route Handlers |
| `lib/supabase-admin.ts` | Service Role Key | Admin ops, cron, worker (bypasses RLS) |
| `lib/supabase/client.ts` | Cookie-based | Client Components |

## Security Headers (applied by proxy.ts)

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security` (production only)

## Rate Limiting

Login page is rate-limited by IP via `checkRateLimit()` in `proxy.ts`.
Config in `lib/security-config.ts` → `RATE_LIMITS.authLoginPage`.
