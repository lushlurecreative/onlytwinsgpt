# Project Overview

## What this product does

OnlyTwins is a production AI content generation platform for creators. Users pay a monthly subscription, upload training photos, and receive AI-generated face-swapped content (photos and videos) each billing cycle. An admin interface manages leads, customers, and operations.

Target revenue: $80k–$150k/month via automated acquisition → billing → AI training → content delivery.

## Core user flow

1. User lands on marketing page, selects a plan
2. Stripe checkout processes payment (credit card or Bitcoin via Coinbase)
3. Webhook provisions Supabase account (profile + subscription rows)
4. User redirected to `/thank-you`, polls until account ready, then logs in
5. User completes onboarding (`/onboarding/creator` or `/onboarding/consumer`)
6. User uploads training photos at `/upload` (stored in Supabase Storage)
7. User configures generation preferences at `/requests`
8. Cron triggers monthly content batch via RunPod GPU workers
9. Results appear in `/vault`

## Plans

| Plan Key | Price | Mode | Images | Videos |
|---|---|---|---|---|
| `starter` | $299/mo | subscription | 45 | 5 |
| `professional` | $599/mo | subscription | 90 | 15 |
| `elite` | $1,299/mo | subscription | 200 | 35 |
| `single_batch` | $399 | one-time | 45 | 0 |
| `partner_70_30` | $100/mo + rev share | subscription | 45 | 5 |
| `partner_50_50` | $1/mo + rev share | subscription | 90 | 15 |

Defined in `lib/package-plans.ts`. Entitlements in `lib/plan-entitlements.ts`.

## Main stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript (strict) |
| Auth & Database | Supabase (Auth, Postgres with RLS, Storage) |
| Payments | Stripe (subscriptions + webhooks), Coinbase Commerce (Bitcoin) |
| AI Workers | RunPod Serverless (FaceFusion face swap, ONNX Runtime GPU) |
| Deployment | Vercel (auto-deploy from GitHub `main`) |
| CSS | Tailwind CSS v4 |
| Animations | Framer Motion |
| Lead scraping | Apify (Instagram, Reddit), YouTube Data API v3 |

## Non-negotiable requirements

- Billing chain (checkout → webhook → provisioning) must never break
- Auth/session handling must never break
- Webhook idempotency (`stripe_webhook_events` insert must come first)
- Never invent DB schema columns — read `supabase/migrations/` first
- Only `app/api/billing/webhook/route.ts` writes to `subscriptions` table
- Admin UX and customer UX are fully separated
- No technical language exposed to customers (no Stripe IDs, status codes, RunPod references)
- No new features until Phase A (Revenue Reliability) is verified complete
