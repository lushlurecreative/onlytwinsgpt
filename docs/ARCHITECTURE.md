# Architecture

## Frontend

Next.js 16 App Router with React 19. All pages under `app/`.

**Customer routes:** `/` (landing), `/login`, `/dashboard`, `/vault`, `/upload`, `/requests`, `/onboarding/*`, `/thank-you`, `/billing/*`, `/feed`, `/creators`

**Admin routes:** `/admin/dashboard`, `/admin/customers`, `/admin/leads`, `/admin/subscriptions`, `/admin/worker`, `/admin/analytics/*`, `/admin/webhooks`, `/admin/settings`

Admin detection: `lib/admin.ts` → `isAdminUser()`. Enforced in `proxy.ts` and `app/admin/layout.tsx`. Admin users are routed to `/admin` and never see the customer shell.

## API routes

All under `app/api/`. Grouped by domain:

- **Billing:** `billing/checkout`, `billing/webhook`, `billing/portal`, `billing/cancel`, `billing/bitcoin/checkout`
- **Auth:** `auth/login`, `me/entitlements`, `me/profile`, `me/referral`, `thank-you/session`, `thank-you/complete`
- **Generation:** `generate/*`, `training/*`, `uploads/*`, `preview/faceswap`
- **Admin:** `admin/customers/*`, `admin/leads/*`, `admin/subscriptions/*`, `admin/worker/*`, `admin/analytics/*`, `admin/automation/*`
- **Cron:** `cron/daily-lead-scrape`, `cron/enqueue-lead-samples`, `cron/send-outreach`, `cron/process-customer-generation`, `cron/monthly-customer-generation`
- **Webhooks:** `webhooks/coinbase`, `webhooks/runpod`, `webhooks/outreach-reply`
- **Internal:** `internal/execute-sql`

## Middleware

`proxy.ts` is the single enforcement point:

- Adds security headers (X-Frame-Options, HSTS, CSP, Permissions-Policy)
- Routes OAuth redirects (`/` + code param → `/auth/callback`)
- Detects admin users → redirects to `/admin`
- Enforces auth on protected routes (`/upload`, `/admin`, etc.)
- Rate limits `/login` (120 req / 60s, per `lib/security-config.ts`)

## Database

Supabase Postgres with RLS. 29 tables. Schema source of truth: `supabase/migrations/`.

**Core tables:** `profiles`, `subscriptions`, `leads`, `generation_jobs`, `generation_requests`, `generation_request_lines`, `presets`, `subjects`, `subjects_models`, `training_jobs`, `posts`, `recurring_request_mixes`

**Billing/tracking:** `stripe_webhook_events`, `revenue_events`, `usage_ledger`, `admin_payment_links`, `admin_referral_links`, `referrals`

**Operations:** `automation_events`, `outreach_logs`, `reply_inbox`, `scrape_triggers`, `audit_log`, `system_events`, `gpu_usage`, `watermark_logs`, `idempotency_keys`, `user_notifications`, `app_settings`

**Key RPCs:** `convert_lead_to_customer()` (lead → customer conversion)

## Worker / background jobs

**Worker:** Python on RunPod Serverless. Located in `worker/`.

- `app.py` — RunPod handler, receives job type `faceswap`
- `face_swap.py` — FaceFusion library wrapper (GPU via ONNX Runtime, CPU fallback)
- `storage.py` — Download/upload helpers
- Base image: `nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04`
- ML engine: `facefusionlib>=1.1.3`, `onnxruntime-gpu==1.17.1`
- Models baked into Docker image: InsightFace buffalo_l pack, inswapper_128

**Cron jobs** (Vercel cron, defined in `vercel.json`):

| Path | Schedule (UTC) |
|---|---|
| `/api/cron/daily-lead-scrape` | 08:00 daily |
| `/api/cron/enqueue-lead-samples` | 09:00 daily |
| `/api/cron/send-outreach` | 10:00 daily |
| `/api/cron/process-customer-generation` | 12:00 daily |
| `/api/cron/monthly-customer-generation` | 00:00 daily (runs daily, processes monthly billing cycles internally) |

## Data flow

```
Stripe Checkout → Webhook → Profile + Subscription rows (Supabase)
                                ↓
User uploads photos → Supabase Storage (`uploads` bucket)
                                ↓
Cron triggers generation → RunPod Serverless job (face swap)
                                ↓
Worker returns result → API stores in Supabase Storage → Vault
```

```
Apify/YouTube scrape → leads table → sample generation → outreach → checkout → customer
```
