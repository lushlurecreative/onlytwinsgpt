# Environment Variables

> All env vars are set in the Vercel dashboard for production. Never commit `.env` files with real values.

## Required (Production)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — **never expose client-side** |
| `DATABASE_URL` | Postgres pooler URI (port 6543, Supabase transaction pooler) |
| `WORKER_SECRET` | Shared secret for RunPod worker → `/api/internal/**` |
| `APP_URL` | Full app URL (e.g. `https://onlytwins.ai`) — used in redirect URLs |
| `RUNPOD_API_KEY` | RunPod API key for submitting jobs |
| `RUNPOD_ENDPOINT_ID` | RunPod serverless endpoint ID |

## Stripe

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_live_...` or `pk_test_...`) |

## Admin

| Variable | Description |
|---|---|
| `ADMIN_OWNER_EMAILS` | Comma-separated list of admin email addresses |

## Vercel Cron

| Variable | Description |
|---|---|
| `CRON_SECRET` | Secret for authenticating Vercel cron requests |

## Lead Scraping (Optional)

| Variable | Description |
|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API v3 key |
| `APIFY_TOKEN` | Apify token for Reddit/Instagram scraping |

## AI Features (Optional)

| Variable | Description |
|---|---|
| `REPLICATE_API_TOKEN` | Replicate API token for LLaVA image quality filtering |
| `FACE_FILTER_ENABLED` | `true` to enable face filtering on generated images |
| `OPENAI_API_KEY` | OpenAI API key (if used for assistant or copy generation) |

## Public URLs

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public-facing site URL (used in og tags, canonical URLs) |

## Notes

- `DATABASE_URL` must use the **transaction pooler** (port 6543), not direct connection (port 5432)
- `APP_URL` and `NEXT_PUBLIC_SITE_URL` may differ in staging environments
- `WORKER_SECRET` must match what is configured in the RunPod worker deployment
- Add new env vars to `.env.example` when introducing them to the codebase
