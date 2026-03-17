# Admin Guide

## Access

Admin access is granted by email. Set `ADMIN_OWNER_EMAILS` in Vercel env vars to a comma-separated list of admin email addresses.

Admins are automatically redirected to `/admin` after login and cannot access the customer shell.

## Admin Dashboard Sections

### Customers (`/admin/customers`)
- View all users, subscription status, usage, and plan
- Access individual customer detail pages
- Manage subscription state, trigger refunds, suspend accounts

### Leads (`/admin/leads`)
- View scraped creator leads from YouTube, Reddit, Instagram
- Trigger manual scrapes
- Manage outreach status and replies
- Convert leads to customers via `convert_lead_to_customer()` RPC
- View reply inbox

### Revenue (`/admin/revenue`)
- Revenue metrics and Stripe event log
- View `revenue_events` table

### Subscriptions (`/admin/subscriptions`)
- List all subscriptions with Stripe sync status
- Subscription health monitoring at `/admin/subscription-health`

### Generation Requests (`/admin/generation-requests`)
- View all customer generation jobs
- Monitor stuck/failed jobs
- Trigger reruns

### Posts (`/admin/posts`)
- Content moderation
- Visibility management

### Creators (`/admin/creators`)
- Creator profile management
- Creator KPIs at `/admin/creator-kpis`

### Subjects (`/admin/subjects`)
- Consent and identity verification tracking

### Worker (`/admin/worker`)
- RunPod worker configuration
- Job monitoring and GPU usage
- Required setup: RunPod endpoint ID and API key

### Automation (`/admin/automation`)
- View and manage Vercel cron job schedule
- Based on `app_settings` table (seed: `seed_app_settings_automation`)

### Webhook Events (`/admin/webhook-events`)
- Stripe webhook event log
- Webhook health at `/admin/webhook-health`

### Alerts & Diagnostics
- `/admin/alerts` — system alerts
- `/admin/diagnostics` — health checks
- `/admin/kpis` — platform KPIs
- `/admin/churn-risk` — churn prediction

### Tools
- `/admin/payment-links` — generate Stripe payment links for customers
- `/admin/user-reset` — delete test users (dev only)
- `/admin/watermark` — watermark management
- `/admin/cost` — GPU cost analysis
- `/admin/entitlements` — plan entitlement config

## Audit Log

All admin actions that modify data should be logged to the `audit_log` table via `lib/audit-log.ts`.

```typescript
import { logAuditEvent } from '@/lib/audit-log'

await logAuditEvent({
  adminId: session.user.id,
  action: 'suspend_user',
  targetId: userId,
})
```

## Payment Links (Admin)

1. Go to `/admin/payment-links`
2. Select customer and plan
3. Generate link — copies to clipboard
4. Send link to customer directly

Powered by Stripe payment links API. See migration `202603160001`.

## Cron Jobs

| Time (UTC) | Endpoint | Purpose |
|---|---|---|
| 8am | `/api/cron/daily-lead-scrape` | Scrape new leads |
| 9am | `/api/cron/enqueue-lead-samples` | Generate lead samples |
| 10am | `/api/cron/send-outreach` | Send outreach messages |
| 12pm | `/api/cron/process-customer-generation` | Process generation queue |
| Midnight | `/api/cron/monthly-customer-generation` | Monthly generation run |

All cron endpoints require `Authorization: Bearer <CRON_SECRET>` header (set by Vercel automatically).
