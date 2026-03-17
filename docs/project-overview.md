# Project Overview

## What it is

OnlyTwins is a production AI content generation platform for creators. It is not a demo or prototype.

Creators pay a monthly subscription. The platform uses their uploaded training photos to generate a batch of AI content (photos and videos) every billing cycle. The admin team manages leads, customers, and operations via a separate admin interface.

## Who uses it

**Customers (creators):** Pay to get AI-generated content. Their journey:
1. Subscribe via Stripe checkout
2. Log in and get routed to `/dashboard`
3. Complete onboarding (`/onboarding/consumer` or `/onboarding/creator`)
4. Upload training photos at `/upload`
5. Configure generation preferences at `/requests`
6. Receive monthly content batch — viewable at `/vault`

**Admins:** Internal team only. Managed at `/admin`. They:
- Manage customers, subscriptions, and billing
- Monitor generation requests and RunPod worker status
- Scrape and outreach creator leads
- Generate payment links for specific prospects

## Technology

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router, React 19 |
| Auth & Database | Supabase (Auth, Postgres with RLS, Storage) |
| Payments | Stripe (subscriptions + webhooks) |
| AI Workers | RunPod (serverless GPU jobs) |
| Deployment | Vercel (auto-deploy from GitHub `main`) |
| CSS | Tailwind CSS v4 |
| Animations | Framer Motion |
| Language | TypeScript (strict mode) |

## Plans

| Plan Key | Price | Mode | Images | Videos |
|---|---|---|---|---|
| `starter` | $299/mo | subscription | 45 | 5 |
| `professional` | $599/mo | subscription | 90 | 15 |
| `elite` | $1,299/mo | subscription | 200 | 35 |
| `single_batch` | $399 one-time | payment | 45 | 0 |
| `partner_70_30` | $100/mo + rev share | subscription | 45 | 5 |
| `partner_50_50` | $1/mo + rev share | subscription | 90 | 15 |

Defined in `lib/package-plans.ts`. Entitlements in `lib/plan-entitlements.ts`.

## Codebase layout

```
app/              Next.js routes and API handlers
components/       Shared customer-facing components
lib/              All business logic (billing, auth, generation, scraping)
supabase/migrations/  Database schema (source of truth)
worker/           RunPod ML worker code
scraper/          Lead scraping utility
docs/             This documentation
proxy.ts          Middleware (auth gates, routing, security headers)
vercel.json       Cron job definitions
```
