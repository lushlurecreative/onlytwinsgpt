# Environment and Services

## Production environment variables

All set in Vercel → Project → Settings → Environment Variables.

### Supabase

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key for client-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key for admin operations |
| `DATABASE_URL` | Yes | Postgres connection string (must use port 6543, transaction pooler) |

### Stripe

| Variable | Required | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | Yes | Server-side Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signature verification (`whsec_...`) |
| `STRIPE_PRICE_ID_STARTER` | Yes | Price ID for $299/mo starter plan |
| `STRIPE_PRICE_ID_PROFESSIONAL` | Yes | Price ID for $599/mo professional plan |
| `STRIPE_PRICE_ID_ELITE` | Yes | Price ID for $1,299/mo elite plan |
| `STRIPE_PRICE_ID_SINGLE_BATCH` | Yes | Price ID for $399 one-time batch |
| `STRIPE_PRICE_ID_PARTNER_70_30` | Yes | Price ID for $100/mo partner plan |
| `STRIPE_PRICE_ID_PARTNER_50_50` | Yes | Price ID for $1/mo partner plan |

Note: Price IDs fall back to `app_settings` table if env vars not set, but env vars are the canonical source.

### RunPod

| Variable | Required | Purpose |
|---|---|---|
| `RUNPOD_API_KEY` | Yes | API key for job dispatch (fallback: `app_settings`) |
| `RUNPOD_ENDPOINT_ID` | Yes | Serverless endpoint ID (fallback: `app_settings`) |
| `WORKER_SECRET` | Yes | Shared secret for worker auth (must match worker config) |

### Generation

| Variable | Required | Purpose |
|---|---|---|
| `GENERATION_ENGINE_ENABLED` | Yes | Must be `"true"` — no fallback, generation returns 503 without it |
| `GENERATION_JOB_MAX_RETRIES` | No | Max retries for failed jobs (default: 2) |
| `JOB_REAPER_GENERATION_MAX_MINUTES` | No | Generation job timeout (default: 120) |
| `JOB_REAPER_TRAINING_MAX_MINUTES` | No | Training job timeout (default: 240) |

### App URLs

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL for checkout redirects |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical URL for SEO/og tags |

### Cron & Webhooks

| Variable | Required | Purpose |
|---|---|---|
| `CRON_SECRET` | Yes | Vercel cron authorization (Bearer token) |
| `ALERT_WEBHOOK_URL` | No | Webhook for operational alerts |
| `OUTREACH_WEBHOOK_URL` | No | Webhook for outreach payloads (Zapier/Make/n8n) |
| `OUTREACH_REPLY_SECRET` | No | Auth secret for outreach reply webhook |

### Lead Scraping

| Variable | Required | Purpose |
|---|---|---|
| `APIFY_TOKEN` | No | Apify API for Reddit/Instagram scraping |
| `APIFY_INSTAGRAM_ACTOR_ID` | No | Custom Apify actor (fallback: default scraper) |
| `YOUTUBE_API_KEY` | No | YouTube Data API v3 |
| `SCRAPER_API_KEY` | No | ScraperAPI for web scraping |

### Other

| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_OWNER_EMAILS` | No | Comma-separated admin emails (fallback: `lush.lure.creative@gmail.com`) |
| `SERVICE_CREATOR_ID` | No | User ID for automated service operations |
| `COINBASE_COMMERCE_API_KEY` | No | Coinbase Commerce for Bitcoin checkout |
| `COINBASE_COMMERCE_WEBHOOK_SECRET` | No | Coinbase webhook validation |
| `REPLICATE_API_TOKEN` | No | Replicate AI for image quality filtering |
| `FACE_FILTER_ENABLED` | No | Set to `"true"` to enable face filtering |
| `MAX_UPLOAD_BYTES` | No | Max upload file size |

## Local environment variables

Copy `.env.example` to `.env.local` and fill in values. Never commit `.env.local`.

## Third-party services

| Service | Dashboard | Purpose |
|---|---|---|
| Supabase | supabase.com/dashboard | Auth, Postgres, Storage |
| Stripe | dashboard.stripe.com | Billing, subscriptions |
| RunPod | runpod.io/console | GPU workers |
| Vercel | vercel.com/dashboard | Hosting, cron, deploys |
| Coinbase Commerce | commerce.coinbase.com | Bitcoin payments |
| Apify | console.apify.com | Lead scraping actors |
| Replicate | replicate.com/dashboard | Image quality AI |

## Deployment notes

- `WORKER_SECRET` must match exactly between Vercel and RunPod worker config
- Run SQL migrations before deploy if schema changes are required
