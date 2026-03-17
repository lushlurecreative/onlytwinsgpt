# Admin Routes

## Access control

Admin access is enforced at two layers:
1. `proxy.ts` — redirects authenticated admins to `/admin` when they hit customer routes
2. `app/admin/layout.tsx` — server-side redirect for every admin page: no session → `/login`, not admin → `/dashboard?unauthorized=admin`

Admin users are identified by email via `lib/admin.ts` → `isAdminUser()`, using the `ADMIN_OWNER_EMAILS` env var.

## Admin nav (visible links)

`app/admin/AdminNav.tsx` — four links:
- Dashboard → `/admin`
- Customers → `/admin/customers`
- Leads → `/admin/leads`
- Billing / Revenue → `/admin/revenue`

Logout links to `/logout`.

## Admin pages

### Dashboard — `/admin`
`app/admin/page.tsx`, `app/admin/AdminHomeClient.tsx`
Overview of platform health.

### Customers — `/admin/customers`
`app/admin/customers/page.tsx`, `app/admin/customers/AdminCustomersClient.tsx`
- List all users with subscription status
- Detail page: `/admin/customers/[workspaceId]` — subscription, generation requests, subjects

### Leads — `/admin/leads`
`app/admin/leads/page.tsx`, `app/admin/leads/AdminLeadsClient.tsx`
- View scraped creator leads
- Trigger scrapes and outreach
- Convert leads to customers (calls `convert_lead_to_customer()` RPC)

### Billing / Revenue — `/admin/revenue`
`app/admin/revenue/page.tsx`
- Revenue metrics from `revenue_events` table

### Subscriptions — `/admin/subscriptions`
Lists subscriptions with Stripe sync status.
Sub-pages: `/admin/subscriptions/expiring`, `/admin/subscriptions/past-due`

### Subscription Health — `/admin/subscription-health`
Monitors subscription state sync between Stripe and DB.

### Generation Requests — `/admin/generation-requests`
Monitor all customer generation jobs across statuses.

### Posts — `/admin/posts`
Content moderation, visibility management.

### Creators — `/admin/creators`, `/admin/creators/[creatorId]`
Creator profile management. Creator KPIs at `/admin/creator-kpis`.

### Subjects — `/admin/subjects`
Consent and identity verification tracking.

### Worker — `/admin/worker`
`app/admin/worker/page.tsx`, `app/admin/worker/AdminWorkerClient.tsx`
RunPod worker config, job monitoring, GPU usage.

### Automation — `/admin/automation`
Cron job management using `app_settings` table.

### Webhook Events — `/admin/webhook-events`
Audit log of all processed Stripe events (`stripe_webhook_events` table).

### Webhook Health — `/admin/webhook-health`
Checks for unprocessed or stuck webhook events.

### KPIs — `/admin/kpis`
Platform-wide KPIs.

### Churn Risk — `/admin/churn-risk`
Churn prediction dashboard.

### Creator KPIs — `/admin/creator-kpis`
Per-creator performance metrics.

### Cohorts — `/admin/cohorts`
Customer cohort analysis.

### Entitlements — `/admin/entitlements`
Plan entitlement configuration review.

### Diagnostics — `/admin/diagnostics`
Health checks and system diagnostics.

### Alerts — `/admin/alerts`
System alert log.

### Cost — `/admin/cost`
GPU cost analysis from `gpu_usage` table.

### Watermark — `/admin/watermark`
Watermark log management.

### Settings — `/admin/settings`
Admin settings.

### User Reset — `/admin/user-reset`
`app/admin/user-reset/AdminUserResetClient.tsx`
Delete test users (dev/staging only).

## Admin API routes (`app/api/admin/`)

All admin API routes must verify the caller is an admin. Use `getSupabaseAdmin()` for DB access.

Key routes:
- `GET /api/admin/session` — `{isAdmin: bool}` — used by auth callback
- `POST /api/admin/payment-links` — create Stripe checkout link for email + plan
- `GET /api/admin/customers` — list customers
- `GET /api/admin/customers/[id]` — customer detail
- `GET /api/admin/leads` — list leads
- `POST /api/admin/leads/scrape` — trigger scrape
- `GET /api/admin/subscriptions` — list subscriptions
- `GET /api/admin/webhook-events` — list Stripe webhook events
- `GET /api/admin/generation-requests` — list generation requests

## Admin payment links

`app/admin/payment-links/` — UI for creating payment links.
`app/api/admin/payment-links/` — creates Stripe checkout session with `metadata.source = "admin_pay_link"`.

When customer pays via an admin payment link, the webhook processes it identically to the pricing flow — provisions Supabase user, upserts profile and subscription.

Data stored in `admin_payment_links` table (migration `202603160001`).
