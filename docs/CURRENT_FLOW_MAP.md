# Current flow map — click to dashboard (Step 2)

Full current flow in plain English. At the end: duplicates, missing steps, wrong order, and conflicts are called out explicitly.

---

## Flow (guest checkout with plan)

**1. User clicks checkout**  
On the pricing page the user clicks the checkout button (e.g. “Start Subscription” for a plan). The client sends a POST to `/api/billing/checkout` with `{ plan }`. The user is not logged in (guest checkout).

**2. Stripe session created**  
The checkout API treats this as guest checkout (plan present, no auth). It gets or creates the Stripe price (via app_settings), builds `success_url` as `{baseUrl}/welcome?session_id={CHECKOUT_SESSION_ID}` and `cancel_url` to pricing, and sets session metadata: plan, creator_id (service), no subscriber_id, and optional lead_id. It creates a Stripe Checkout session and returns `{ url: session.url }`. The client then does `window.location.href = data.url`, so the browser goes to Stripe’s hosted checkout page.

**3. Payment success**  
The user completes payment on Stripe (card, etc.). Stripe marks the session as paid and, for subscriptions, creates a subscription object.

**4. Stripe redirects to success_url**  
Stripe redirects the user’s browser to the app at `/welcome?session_id=cs_xxx` (the same tab that was on Stripe). There is no guarantee that any webhook has run yet.

**5. Webhook fires**  
Stripe sends webhooks to `/api/billing/webhook`. For a subscription plan, two events matter, in this order:

- **checkout.session.completed** (first): The handler sees no `subscriber_id` in metadata (guest) and a `creator_id`. It reads the customer email from the session, creates a new Supabase Auth user with a random temporary password and `email_confirm: true` (or, if that email already exists, finds that user and only updates the profile). It then upserts the **profile** with: id (user id), stripe_customer_id, onboarding_pending = true, role = "creator". If metadata contains **lead_id**, it calls the RPC **convert_lead_to_customer** (lead status → converted, one automation_event inserted). The **subscriptions** table is not written in this event.

- **customer.subscription.created** (second): The handler resolves creator_id and subscriber_id. For a guest, subscriber_id is not in subscription metadata, so it looks up the profile by stripe_customer_id (set in the previous step) and uses that profile’s id as subscriber_id. It then upserts the **subscriptions** row (creator_id, subscriber_id, status, stripe_subscription_id, etc.). It also writes revenue_events and, if subscription metadata has lead_id and status is active/trialing, updates the lead to status = converted again and inserts another automation_event.

**6. Auth user created (if applicable)**  
For guest checkout, the Auth user is created (or found) only inside the **checkout.session.completed** webhook handler, as in step 5. It does not happen in the checkout API or on the welcome page. So “Auth user created” happens when the webhook runs, which can be before or after the user lands on /welcome.

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

**9. /welcome loads**  
The user’s browser has already been sent to `/welcome?session_id=...` by Stripe (step 4). The welcome page loads. It may load before or after the webhooks in step 5 have run.

**10. Password set**  
The welcome page fetches the session with GET `/api/welcome/session?session_id=...` (Stripe session is retrieved; must be paid; email is returned). The form shows the email (read-only), and the user enters password, confirm password, and optional display name. On submit, the client sends POST `/api/welcome/complete` with session_id, email, password, displayName. The complete API: re-checks the Stripe session is paid and that the session email matches the body email; finds the Auth user by email (admin listUsers); if no user is found it returns 400 “No account found for this email”. If the user exists, it updates the user’s password (admin.updateUserById) and, if provided, the profile’s full_name. It does **not** set onboarding_pending to false.

**11. User signed in**  
After a successful complete response, the welcome page client calls `supabase.auth.signInWithPassword({ email, password })`. The user is now logged in in that browser.

**12. Redirect to dashboard**  
The welcome page then does `window.location.replace("/start")`. The user lands on the Start Here dashboard. The start page requires auth; if the user is present it renders the dashboard (e.g. “Open Training Vault”). If not, it redirects to `/login?redirectTo=/start`.

---

## Duplicates, missing steps, wrong order, conflicts

**Duplicate: Lead conversion**  
When **lead_id** is present, the lead is converted twice:

1. In **checkout.session.completed** via the RPC `convert_lead_to_customer` (lead status + one automation_event).
2. In **customer.subscription.created** (or updated) by directly updating the lead status and inserting another automation_event.

So you can get two “converted” automation_events for the same lead and the lead status set twice.

**Wrong order / race: Redirect before backend is ready**  
Stripe redirects the user to `/welcome` (step 4) as soon as payment succeeds. The webhook (step 5) and thus Auth user creation (step 6) and profile/workspace creation (step 8) can run **after** the user is already on /welcome. So:

- **/welcome can load before the Auth user exists.**  
  If the user submits the “Complete” form before **checkout.session.completed** has run, the complete API cannot find a user by email and returns “No account found for this email.” There is no retry or “setting up your account” handling.

- So in real time, the order can be: **Stripe redirects to success_url** → **/welcome loads** → (later) **Webhook fires** → **Auth user created** → **Workspace (profile) created**. That conflicts with the assumption that “password set” (step 10) always runs after “Auth user created” (step 6).

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
| Stripe redirects to success_url | 4 | Yes. User can land on /welcome before webhook runs. |
| Webhook fires | 5 | Yes; two events: checkout.session.completed then customer.subscription.created. |
| Auth user created | 6 | Only in checkout.session.completed; can happen after step 4/9. |
| Lead converted | 7 | Done in both checkout.session.completed (RPC) and customer.subscription.created (direct update) when lead_id present → duplicate. |
| Workspace created | 8 | Profile in checkout.session.completed; subscription row in customer.subscription.created (split, and subscription can lag). |
| /welcome loads | 9 | Can happen before steps 5–8. |
| Password set | 10 | Requires user to exist; fails if webhook hasn’t run yet. |
| User signed in | 11 | After successful complete. |
| Redirect to dashboard | 12 | Client replace to /start. |

End of current flow map.
