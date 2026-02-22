# Stripe and entitlement verification checklist

Use this to confirm checkout, webhook, and content gating work in your **live** (or staging) environment. These steps require you to perform actions in the browser and in Stripe; they cannot be fully automated by the app.

---

## 1. Confirm environment variables

In Vercel → Project → Settings → Environment Variables, ensure:

- `STRIPE_SECRET_KEY` (live or test key)
- `STRIPE_WEBHOOK_SECRET` (from Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret)
- `STRIPE_PRICE_ID` (the price ID used at checkout)
- `NEXT_PUBLIC_APP_URL` or `APP_URL` (your app URL, used in checkout success/cancel URLs)

Redeploy after changing.

---

## 1b. Where test payments and activity appear in Stripe

The **Developers → Workbench → Overview** page shows API/log usage (e.g. "No requests in the last 7 days"). That screen is **not** where you see individual payments.

- **Payments:** Stripe Dashboard → **Payments** (left sidebar). Test payments appear here with status "Succeeded."
- **Customers:** Stripe Dashboard → **Customers** (left sidebar). The customer created for the test payment appears here.
- **Webhook deliveries:** **Developers → Webhooks** → click your endpoint → **Recent deliveries**. Here you see whether `checkout.session.completed` (or similar) was sent and if the response was 200.

If **Payments** and **Recent deliveries** are also empty after a test checkout, the app may be using a **different Stripe account** than the one you're viewing: ensure `STRIPE_SECRET_KEY` (and any publishable key) in Vercel are from the same Stripe account, and that you have **Test mode** toggled correctly (orange banner) so test/live mode matches your keys.

### Troubleshooting: Still no payments or customers?

- Open **Payments** and **Customers** from the main Stripe sidebar (not Developers → Overview). Those are where test payments and customers appear.
- Ensure the Stripe account and **Test/Live** mode match the keys in Vercel (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`). If your keys are from a different Stripe account or mode, the dashboard you’re viewing will show nothing.
- If you completed a test checkout but see nothing in Payments or Customers, confirm the webhook endpoint URL is your app URL (e.g. `https://onlytwins.dev/api/billing/webhook`) and that `STRIPE_WEBHOOK_SECRET` in Vercel matches the signing secret shown in Stripe for that endpoint.

---

## 2. Run a test checkout (you do this)

1. Open your app in the browser (logged in as a test user).
2. Go to the page that starts checkout (e.g. pricing or a "Subscribe" button).
3. Click through to checkout and complete payment (use Stripe test card `4242 4242 4242 4242` if using test mode).
4. After payment, you should be redirected back to your app (e.g. success or account page).
5. In Stripe Dashboard → Payments, confirm the payment appears and is succeeded.

---

## 3. Confirm webhook updates subscriptions (you do this)

1. In Stripe Dashboard → Developers → Webhooks, open your endpoint for this project.
2. Open "Recent deliveries" and find the event for the payment you just made (e.g. `checkout.session.completed` or `customer.subscription.created`).
3. Confirm the delivery succeeded (HTTP 200).
4. In your app, open the page that shows the user’s subscription (e.g. /start or /me/entitlements) and confirm the subscription and plan are shown (e.g. "Active", plan name).

If the webhook failed, fix the endpoint URL or webhook secret in Vercel and redeploy; then run another test checkout.

---

## 4. Confirm entitlement gating (you do this)

1. As the user who just subscribed, open the creator feed URL for your service (e.g. `/feed/creator/[creator-id]`).
2. Confirm you see **subscriber-only** posts (not only public posts).
3. Log out or use an incognito window and open the same creator feed without being subscribed.
4. Confirm you see only **public** posts and that subscriber-only content is locked/teased.

This verifies that `hasActiveSubscription` and the feed API are gating correctly.

---

## 5. Optional: regression tests (automated)

The repo can include API or E2E tests that assert:

- Public feed returns only `visibility: "public"` and `is_published: true`.
- Creator feed with no auth returns only public posts.
- Creator feed with valid subscription for that creator returns public + subscriber posts.

Add these under `tests/` or in your E2E suite and run them in CI after any change to feed or entitlement logic.
