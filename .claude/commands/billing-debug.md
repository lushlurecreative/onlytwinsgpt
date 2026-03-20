Diagnose the OnlyTwins billing flow end-to-end.

First read these files for context:
- app/api/billing/webhook/route.ts
- app/api/billing/checkout/route.ts
- lib/stripe.ts
- lib/package-plans.ts

Then query the database and check:
1. Last 10 stripe_webhook_events — show stripe_event_id, event_type, processed_at (flag any nulls)
2. Last 5 subscriptions — show user_id, status, stripe_customer_id, plan_key
3. Any profiles with null stripe_customer_id who have a subscription row
4. Any subscriptions with status != 'active' in the last 7 days

Report anomalies, identify the root cause of any failures, and suggest exact fixes.
