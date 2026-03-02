# Current flow map — click to dashboard (Step 2)

Full current flow in plain English. At the end: duplicates, missing steps, wrong order, and conflicts are called out explicitly.

---

## Flow (guest checkout with plan)

**1. User clicks checkout**  
On the pricing page the user clicks the checkout button (e.g. “Start Subscription” for a plan). The client sends a POST to `/api/billing/checkout` with `{ plan }`. The user is not logged in (guest checkout).

**2. Stripe session created**  
The checkout API treats this as guest checkout (plan present, no auth). It gets or creates the Stripe price (via app_settings), builds `success_url` as `https://onlytwins.dev/thank-you?sid={CHECKOUT_SESSION_ID}` and `cancel_url` to pricing, and sets session metadata: plan, creator_id (service), no subscriber_id, and optional lead_id. It creates a Stripe Checkout session and returns `{ url: session.url }`. The client then does `window.location.href = data.url`, so the browser goes to Stripe’s hosted checkout page.

**3. Payment success**  
The user completes payment on Stripe (card, etc.). Stripe marks the session as paid and, for subscriptions, creates a subscription object.

**4. Stripe redirects to success_url**  
Stripe redirects the user’s browser to the app at `/thank-you?sid=cs_xxx` (the same tab that was on Stripe). Middleware then stores `sid` in an httpOnly cookie and redirects to clean `/thank-you`. There is no guarantee that any webhook has run yet.

**5. Webhook fires**  
Stripe sends webhooks to `/api/billing/webhook`. For a subscription plan, two events matter, in this order:

- **checkout.session.completed** (first): The handler sees no `subscriber_id` in metadata (guest) and a `creator_id`. It reads the customer email from the session, creates a new Supabase Auth user with a random temporary password and `email_confirm: true` (or, if that email already exists, finds that user and only updates the profile). It then upserts the **profile** with: id (user id), stripe_customer_id, onboarding_pending = true, role = "creator". If metadata contains **lead_id**, it calls the RPC **convert_lead_to_customer** (lead status → converted, one automation_event inserted). The **subscriptions** table is not written in this event.

- **customer.subscription.created** (second): The handler resolves creator_id and subscriber_id. For a guest, subscriber_id is not in subscription metadata, so it looks up the profile by stripe_customer_id (set in the previous step) and uses that profile’s id as subscriber_id. It then upserts the **subscriptions** row (creator_id, subscriber_id, status, stripe_subscription_id, etc.). It also writes revenue_events and, if subscription metadata has lead_id and status is active/trialing, updates the lead to status = converted again and inserts another automation_event.

**6. Auth user created (if applicable)**  
For guest checkout, the Auth user is created (or found) only inside the **checkout.session.completed** webhook handler, as in step 5. It does not happen in the checkout API or on the thank-you page. So “Auth user created” happens when the webhook runs, which can be before or after the user lands on /thank-you.

**7. Lead converted**  
If the session (or subscription) has **lead_id** in metadata:

- In **checkout.session.completed**: the handler calls the RPC **convert_lead_to_customer**, which sets the lead’s status to converted and inserts one row into automation_events.
- In **customer.subscription.created** (or updated): the handler again sets the lead’s status to converted and inserts another row into automation_events (when status is active/trialing).

So lead conversion is done twice for the same lead when lead_id is present: once in the RPC, once in the subscription handler.

**8. Workspace created**  
“Workspace” here is the customer record (profile + subscription):

- **Profile**: Created/updated in **checkout.session.completed** (same step as Auth user creation). So the “workspace” profile exists after that webhook run.
- **Subscription row**: Created/updated in **customer.subscription.created** (or updated). The subscription row is created only after the profile exists, because subscriber_id is resolved from profiles.stripe_customer_id when not in metadata.

So workspace creation is split across two webhook events: profile first, subscription row second.

**9. /thank-you loads**  
The user’s browser has already been sent to `/thank-you?sid=...` by Stripe (step 4). Middleware rewrites to clean `/thank-you`, and the page loads. It may load before or after the webhooks in step 5 have run.

**10. Auth on thank-you**  
The thank-you page fetches session state with GET `/api/thank-you/session` (session id is taken from `sid` query or `ot_checkout_sid` cookie). The API retrieves Stripe session, checks paid/ready, and returns `state` plus email. The page shows processing until ready, then offers Google OAuth and magic link auth.

**11. User signed in**  
After successful OAuth or magic link auth, the user is signed in in that browser.

**12. Redirect to dashboard**  
The thank-you page redirects authenticated users to `/dashboard` (alias route to `/start`).

---

## Duplicates, missing steps, wrong order, conflicts

**Duplicate: Lead conversion**  
When **lead_id** is present, the lead is converted twice:

1. In **checkout.session.completed** via the RPC `convert_lead_to_customer` (lead status + one automation_event).
2. In **customer.subscription.created** (or updated) by directly updating the lead status and inserting another automation_event.

So you can get two “converted” automation_events for the same lead and the lead status set twice.

**Wrong order / race: Redirect before backend is ready**  
Stripe redirects the user to `/thank-you` (step 4) as soon as payment succeeds. The webhook (step 5) and thus Auth user creation (step 6) and profile/workspace creation (step 8) can run **after** the user is already on /thank-you. So:

- **/thank-you can load before the Auth user exists.**  
  The state API can remain in `processing` until webhook provisioning is complete.

- So in real time, the order can be: **Stripe redirects to success_url** → **/thank-you loads** → (later) **Webhook fires** → **Auth user created** → **Workspace (profile) created**.

**Missing step: onboarding_pending**  
The migration comment says onboarding_pending should be cleared after the user completes the welcome step. The welcome complete API does not set `onboarding_pending = false`; it only updates password and optional full_name. So that step is missing.

**Workspace created in two events**  
“Workspace” (profile + subscription) is not created in one place. Profile is created in **checkout.session.completed**; the subscription row is created in **customer.subscription.created**. So a “workspace” is only fully created after both webhook events. For the welcome/complete flow this is usually fine (user sets password later), but the dashboard or vault can be hit before **customer.subscription.created** has run; then the subscription row might not exist yet (e.g. for entitlements or “active subscription” checks). That’s an ordering dependency.

**Conflict: Welcome complete assumes user exists**  
The welcome complete API assumes the Auth user already exists (created by the webhook). Because of the race above, the user may submit the form before the webhook has created the user, so complete fails with “No account found.” The flow assumes “Auth user created” before “Password set,” but the current order of redirect vs webhook can violate that.

---

## Summary table (intended vs actual order)

| Step | Intended order | What actually happens |
|------|----------------|------------------------|
| User clicks checkout | 1 | Yes. |
| Stripe session created | 2 | Yes (API + client redirect to Stripe). |
| Payment success | 3 | Yes. |
| Stripe redirects to success_url | 4 | Yes. User can land on /thank-you before webhook runs. |
| Webhook fires | 5 | Yes; two events: checkout.session.completed then customer.subscription.created. |
| Auth user created | 6 | Only in checkout.session.completed; can happen after step 4/9. |
| Lead converted | 7 | Done in both checkout.session.completed (RPC) and customer.subscription.created (direct update) when lead_id present → duplicate. |
| Workspace created | 8 | Profile in checkout.session.completed; subscription row in customer.subscription.created (split, and subscription can lag). |
| /thank-you loads | 9 | Can happen before steps 5–8. |
| Auth allowed | 10 | Waits on state=ready from session API. |
| User signed in | 11 | After successful complete. |
| Redirect to dashboard | 12 | Client replace to /start. |

End of current flow map.
