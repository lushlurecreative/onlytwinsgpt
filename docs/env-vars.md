# Environment Variables

All production env vars are set in Vercel → Project → Settings → Environment Variables. Never commit real values. Reference `.env.example` for the template.

## Required

### Supabase
| Variable | Where to get it | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | Secret — never expose client-side |
| `DATABASE_URL` | Supabase → Settings → Database → URI | Must use transaction pooler port 6543, not 5432 |

### Stripe
| Variable | Where to get it | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → API keys | `sk_live_...` or `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks | `whsec_...` — for signature verification |

### Stripe Price IDs
Each plan requires its own price ID from Stripe. These must match live Stripe prices.
| Variable | Plan | Status |
|---|---|---|
| `STRIPE_PRICE_ID_STARTER` | starter ($299/mo) | **Confirmed required** |
| `STRIPE_PRICE_ID_PROFESSIONAL` | professional ($599/mo) | **Confirmed required** |
| `STRIPE_PRICE_ID_ELITE` | elite ($1,299/mo) | **Confirmed required** |
| `STRIPE_PRICE_ID_SINGLE_BATCH` | single_batch ($399 one-time) | **Confirmed required** |
| `STRIPE_PRICE_ID_PARTNER_70_30` | partner_70_30 ($100/mo) | **Confirmed required** |
| `STRIPE_PRICE_ID_PARTNER_50_50` | partner_50_50 ($1/mo) | **Confirmed required** |

These env vars are read by `lib/plan-entitlements.ts` → `loadPriceIdPlanMap()` and `lib/stripe-price-for-plan.ts`. If not set, the system now falls back to the `app_settings` table (keys: `stripe_price_starter`, etc.) which is populated automatically when checkout sessions are created via `getOrCreatePriceIdForPlan()`. Both paths work — but setting the env vars is the simpler and more reliable option.

### RunPod / Worker
| Variable | Notes | Status |
|---|---|---|
| `WORKER_SECRET` | Shared secret — must match what the RunPod worker sends in `X-Worker-Secret` header | **Confirmed required** |
| `APP_URL` | Full app URL e.g. `https://onlytwins.dev` — used in RunPod webhook callbacks | **Confirmed required** |
| `RUNPOD_API_KEY` | RunPod API key for submitting jobs | **Optional as env var** — falls back to `app_settings.runpod_api_key` (set via admin UI). Required in one form or the other. |
| `RUNPOD_ENDPOINT_ID` | RunPod serverless endpoint ID | **Optional as env var** — falls back to `app_settings.runpod_endpoint_id`. Required in one form or the other. |

### App URL
| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public URL — used in og tags and canonical URLs |
| `NEXT_PUBLIC_APP_URL` | Used in checkout success/cancel URLs (see `app/api/billing/checkout/route.ts`) |

### Admin
| Variable | Notes |
|---|---|
| `ADMIN_OWNER_EMAILS` | Comma-separated admin emails. Defaults to `lush.lure.creative@gmail.com` if not set. Used by `lib/admin.ts`. |

### Cron
| Variable | Notes |
|---|---|
| `CRON_SECRET` | Vercel injects this as `Authorization: Bearer <CRON_SECRET>` into cron requests. All cron handlers verify this. |

## Optional

### Lead Scraping
| Variable | Notes |
|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API v3 — required for YouTube lead scraping |
| `APIFY_TOKEN` | Apify token — required for Reddit/Instagram scraping via `lib/apify.ts` |

### Lead Outreach
| Variable | Notes |
|---|---|
| `OUTREACH_WEBHOOK_URL` | HTTP endpoint (Zapier, Make, n8n) that receives outreach payloads. If not set, falls back to `sendAlert()`. Set in `lib/outreach.ts`. |

### Image Quality Filtering
| Variable | Notes |
|---|---|
| `REPLICATE_API_TOKEN` | Replicate API — used by `lib/image-quality.ts` for LLaVA face filtering on lead ingest |
| `FACE_FILTER_ENABLED` | Set to `"true"` to enable face quality filtering during lead ingest |

### Generation Engine
| Variable | Notes | Status |
|---|---|---|
| `GENERATION_ENGINE_ENABLED` | Must be `"true"` for generation to run. Checked by `lib/generation-engine.ts` → `isGenerationEngineEnabled()`. No fallback — if not set, all generation silently returns 503. | **Confirmed required** |
| `GENERATION_JOB_MAX_RETRIES` | Integer. Max RunPod retries for failed `job_type = "user"` jobs. Default `2`. Set in `app/api/webhooks/runpod/route.ts`. | Optional (defaults to 2) |

### Bitcoin / Coinbase Commerce
| Variable | Notes |
|---|---|
| `COINBASE_COMMERCE_API_KEY` | Required for bitcoin checkout (`app/api/billing/bitcoin/checkout/route.ts`). If not set, that route returns 500. |

### Publishable Stripe Key
| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` or `pk_test_...` — only if used in client-side Stripe Elements |

## Notes

- `DATABASE_URL` must use the **transaction pooler** (port `6543`), not the direct connection (port `5432`). Vercel serverless functions require pooled connections.
- `WORKER_SECRET` must match exactly between the Vercel env and the RunPod worker deployment config.
- When adding a new env var: add it to `.env.example` with a comment, and document it here.
- `ADMIN_OWNER_EMAILS` has a hardcoded fallback in `lib/admin.ts`. Do not rely on the fallback in production — set the env var explicitly.
