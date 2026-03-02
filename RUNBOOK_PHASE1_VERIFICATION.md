# RUNBOOK – PHASE 1 PRODUCTION VERIFICATION

This runbook verifies Phase 1 reliability in production with concrete evidence.

Use this against the live deployment only.

---

## Preconditions

1. Confirm latest production deploy is `Ready` in Vercel.
2. Confirm Stripe webhook endpoint points to:
   - `https://<your-domain>/api/billing/webhook`
3. Confirm required production env vars exist:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_APP_URL`
   - Supabase keys/service role
   - Worker envs (`WORKER_SECRET`, RunPod vars if used)
4. Prepare one test email not used recently.

---

## 1) Guest Checkout End-to-End Verification

### Goal
`/pricing` -> Stripe Checkout -> `/welcome?session_id=...` -> password set -> auto sign-in -> `/start`.

### Steps
1. Open production `/pricing` in an incognito window.
2. Start plan checkout as a guest.
3. Complete Stripe payment.
4. After redirect, confirm URL includes:
   - `/welcome?session_id=cs_...`
5. Complete password form and submit.
6. Confirm browser auto-redirects to `/start`.

### Required Evidence (record all)
- Stripe Checkout Session ID (`cs_...`)
- Stripe Customer ID (`cus_...`)
- Stripe Subscription ID (`sub_...`) for subscription plans
- Webhook event IDs used in this flow:
  - `checkout.session.completed`
  - `customer.subscription.created` (and later updates/deletes if triggered)
- DB row evidence:
  - `profiles` row created/updated (id, `stripe_customer_id`, `onboarding_pending`)
  - `subscriptions` row created/updated (`status`, `stripe_subscription_id`, `stripe_price_id`)
- URL/screenshot notes:
  - pricing page start
  - welcome URL with session_id
  - final `/start` page

### Suggested SQL checks
```sql
-- Replace with known IDs from evidence.
select id, stripe_customer_id, onboarding_pending, role, created_at, updated_at
from public.profiles
where stripe_customer_id = 'cus_xxx';

select stripe_subscription_id, subscriber_id, creator_id, status, stripe_price_id, current_period_end, canceled_at, updated_at
from public.subscriptions
where stripe_subscription_id = 'sub_xxx';
```

---

## 2) Webhook Health Verification (Stripe 2xx)

### Goal
Confirm stable 2xx deliveries for:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### Steps
1. In Stripe Dashboard -> Developers -> Webhooks -> select production endpoint.
2. Open Recent deliveries.
3. Filter by each event type above.
4. Confirm latest events return HTTP 2xx.

### Required Evidence
- For each event type:
  - Event ID (`evt_...`)
  - Delivery timestamp
  - HTTP status

### Suggested SQL checks
```sql
select stripe_event_id, event_type, received_at, processed_at
from public.stripe_webhook_events
where event_type in (
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
)
order by received_at desc
limit 50;
```

---

## 3) Subscription -> Entitlement Gating Verification

### Goal
For one test user/workspace, verify gating behavior by subscription state:
- `trialing` / `active`
- `past_due`
- `canceled`

### Enforcing Routes (current)
- `app/api/feed/creator/[creatorId]/route.ts`
- `app/api/me/entitlements/route.ts`
- `lib/subscriptions.ts` (active-subscription checks used by feed/vault flows)

### Steps
1. Use one test user and note `subscriber_id`.
2. Force/observe each subscription status in Stripe (or via test clock/events).
3. For each status:
   - Call `GET /api/me/entitlements` while signed in as test user.
   - Call creator feed route and verify returned content mode/access.

### Required Evidence
- API response snapshot:
  - `/api/me/entitlements`
  - `/api/feed/creator/<creatorId>`
- DB row snapshot in `subscriptions` for same user/status.

### Suggested SQL check
```sql
select subscriber_id, creator_id, status, stripe_subscription_id, stripe_price_id, current_period_end, canceled_at, updated_at
from public.subscriptions
where subscriber_id = 'user_uuid_here'
order by updated_at desc;
```

---

## 4) Worker Reliability Verification

### Goal
Confirm heartbeat + one generation job completes end-to-end.

### Steps
1. Trigger one generation workflow from app/admin.
2. Observe worker pulls pending jobs and updates statuses.
3. Confirm job finishes and output asset is written.
4. Verify admin health endpoint reports expected status.

### Required Evidence
- Heartbeat evidence:
  - latest `system_events` row for `worker_heartbeat` (timestamp)
- One job evidence:
  - `generation_jobs.id`
  - status transition timeline (`pending` -> `running` -> `completed` or failure path)
  - output path
  - storage object path present

### Suggested SQL checks
```sql
select event_type, created_at
from public.system_events
where event_type = 'worker_heartbeat'
order by created_at desc
limit 10;

select id, status, runpod_job_id, output_path, created_at
from public.generation_jobs
order by created_at desc
limit 20;
```

---

## 5) Signed URL Access Boundary Verification

### Goal
Validate access boundaries and expiry behavior:
- subscriber vs non-subscriber
- admin vs creator

### Steps
1. As subscriber, load subscriber-only content and verify signed URLs load.
2. As non-subscriber, confirm subscriber-only content is not returned/unlocked.
3. As admin, test admin signed-url route for customer assets.
4. As non-admin, confirm admin signed-url route is denied.
5. Test expiry:
   - wait past TTL and confirm signed URL returns expired/denied.

### Required Evidence
- Allowed case results (HTTP code + URL path)
- Denied case results (HTTP code + error payload)
- Expiry case result after TTL

### Relevant routes
- `app/api/feed/creator/[creatorId]/route.ts`
- `app/api/admin/customers/signed-url/route.ts`
- `app/api/posts/route.ts`
- `app/api/uploads/route.ts`

---

## Evidence Log Template (fill per run)

```text
Run Date/Time:
Operator:
Deployment URL:

Checkout:
- Session ID:
- Customer ID:
- Subscription ID:
- Final redirect URL:

Webhooks:
- checkout.session.completed: evt_xxx / timestamp / status
- customer.subscription.created: evt_xxx / timestamp / status
- customer.subscription.updated: evt_xxx / timestamp / status
- customer.subscription.deleted: evt_xxx / timestamp / status

DB snapshots taken:
- profiles row: yes/no
- subscriptions row: yes/no
- generation_jobs row: yes/no
- system_events heartbeat row: yes/no

Access boundary tests:
- Subscriber allowed: pass/fail
- Non-subscriber denied: pass/fail
- Admin signed URL allowed: pass/fail
- Non-admin denied: pass/fail
- Signed URL expiry check: pass/fail
```
