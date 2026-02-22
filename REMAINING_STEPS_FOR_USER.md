# Remaining steps only you can do

These tasks require **you** to perform actions in a browser, in Stripe, or with secrets. The app cannot do them automatically.

---

## 1. Run one live Stripe checkout and confirm webhook + entitlement

**Why:** Ensures real payments and webhooks work in your environment.

1. Open your deployed app in the browser (e.g. `https://your-app.vercel.app`).
2. Sign in (or create a test account).
3. Go to the page that starts a subscription (e.g. pricing or “Subscribe”).
4. Click to start checkout and complete payment.
   - If using **test mode**: use card `4242 4242 4242 4242`, any future expiry, any CVC.
5. After payment, you should be redirected back to the app.
6. In **Stripe Dashboard** → **Developers** → **Webhooks** → your endpoint → **Recent deliveries**, confirm the latest event (e.g. `checkout.session.completed`) shows **HTTP 200**.
7. In your app, open the page that shows “My subscription” or “Billing” and confirm the subscription appears (e.g. “Active”, plan name).

**If the webhook failed:** Fix the webhook URL or `STRIPE_WEBHOOK_SECRET` in Vercel, redeploy, then run steps 1–7 again.

---

## 2. Confirm content gating (subscriber vs non-subscriber)

**Why:** Confirms only subscribers see subscriber-only posts.

1. While **signed in as the user who just subscribed**, open the creator feed URL (e.g. `/feed/creator/[creator-id]`). You should see **subscriber-only** posts.
2. Open a **private/incognito** window (or sign out) and open the **same** creator feed URL.
3. Confirm you see only **public** posts and that subscriber-only content is locked/teased.

---

## 3. RunPod: endpoint and env vars (click-by-click)

**Why:** Image generation runs on RunPod; the app needs the endpoint and key.

If you **already have a pod** (e.g. onlytwins-worker), skip creating a new one and use these steps:

1. In RunPod, open **Pods** and click your pod (e.g. onlytwins-worker).
2. Copy the **Pod ID** (e.g. from the pod name row or details; the ID may look like `vzinvqqhcrvuzq`). For RunPod Serverless, use the **Endpoint ID** from the Endpoints list instead.
3. In RunPod go to **Settings** (or your profile) → **API Keys** → create or copy your API key.
4. In Vercel → project → **Settings** → **Environment Variables**, add `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` (use the Pod ID or Endpoint ID from step 2).
5. Save and redeploy.

**If you need to create a new endpoint:**

1. Open a browser and go to **[runpod.io](https://www.runpod.io)**. Log in (or create an account).
2. In the left sidebar, click **Pods** or **Endpoints** (RunPod’s UI may say either).
3. Click **+ Deploy** or **Create Endpoint** (or the equivalent button to create a new endpoint).
4. Choose **GPU** and the region/template required by your worker. (See your worker docs or the `worker/` folder in this repo for which GPU or image to use.)
5. After the endpoint is created, open it. On the endpoint details page, find:
   - **Endpoint ID** — often in the page URL or clearly labeled on the page. Copy it.
   - For the **API key**: in RunPod, go to **Settings** (or your account/profile) → **API Keys** → create a new key or copy an existing one.
6. Open **Vercel** in another tab: go to [vercel.com](https://vercel.com), open your project for this app.
7. Click **Settings** → **Environment Variables**.
8. Add two variables (click “Add” for each):
   - **Name:** `RUNPOD_API_KEY`  
     **Value:** (paste the RunPod API key you copied)  
     **Environment:** Production (and Preview if you use preview deploys).
   - **Name:** `RUNPOD_ENDPOINT_ID`  
     **Value:** (paste the Endpoint ID you copied)  
     **Environment:** Production (and Preview if needed).
9. Click **Save**.
10. **Redeploy** so the new variables are used: go to **Deployments** → open the **⋯** menu on the latest deployment → **Redeploy**, or push a new commit to trigger a deploy.

---

## 4. Mind map / layout spec (optional — only if you have one)

**What this means:** A “mind map” or “layout spec” is any document or sketch that describes how you want the app to look or be organized. For example: which pages exist, what’s on each page, how things are grouped. It does not need to be technical.

**Why it’s here:** So an assistant (or developer) can align the UI with your vision instead of guessing.

**What you do:**

- **If you don’t have one:** Ignore this step. No action needed.
- **If you do have one** (e.g. a list of pages, a sketch on paper, a Figma link, or a note like “pricing should be at the top”):
  1. Put it in the repo (e.g. a file in `docs/`, like `docs/my-layout-ideas.md` or `docs/screens.txt`), **or**
  2. Paste the relevant part in chat and say something like: “Use this for how the app should be laid out.”
  Then the assistant can suggest or make UI changes to match it.

---

## 5. Optional: rotate secrets if they were ever pasted in chat

**Why:** If any API keys or secrets were pasted in a chat or committed, they should be rotated.

1. In **Stripe** → **Developers** → **API keys**: roll the secret key if needed; update `STRIPE_SECRET_KEY` in Vercel.
2. In **Stripe** → **Developers** → **Webhooks**: create a new signing secret for the endpoint; update `STRIPE_WEBHOOK_SECRET` in Vercel.
3. In **Supabase** → **Settings** → **API**: regenerate anon/service keys if needed; update env vars in Vercel.
4. Redeploy after changing any variables.

---

## Quick reference

| Step | You do |
|------|--------|
| 1 | One live Stripe checkout + check webhook + subscription in app |
| 2 | Check subscriber vs non-subscriber view of creator feed |
| 3 | RunPod endpoint + set `RUNPOD_*` in Vercel and redeploy |
| 4 | Add mind map/layout spec to repo or chat |
| 5 | (Optional) Rotate any exposed secrets and update Vercel |

For Stripe verification details, see [docs/STRIPE_VERIFICATION_CHECKLIST.md](docs/STRIPE_VERIFICATION_CHECKLIST.md).
