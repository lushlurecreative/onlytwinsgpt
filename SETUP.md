# ONLYTWINS – Setup (do this once)

Set these so **scrape**, **ingest**, and **AI sample generation** work. The app cannot set your accounts for you; follow the steps below.

---

## 1. Vercel environment variables

In **Vercel** → your project → **Settings** → **Environment Variables**, add:

| Variable | Required | Where to get it |
|----------|----------|------------------|
| `DATABASE_URL` | Yes | Supabase → Settings → Database → Connection string (URI). Use the **pooler** URI (port 6543) for serverless. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase → Settings → API → service_role (keep secret) |
| `WORKER_SECRET` | Yes (for AI) | Generate: `openssl rand -hex 32` |
| `APP_URL` | Yes (for AI) | Your app URL, e.g. `https://onlytwins.vercel.app` (no trailing slash) |
| `RUNPOD_API_KEY` | Yes (for AI) | RunPod → Settings → API Keys → Create (or set in Admin → Leads → Worker) |
| `RUNPOD_ENDPOINT_ID` | Yes (for AI) | RunPod → Serverless → your endpoint → ID (or set in Admin → Leads → Worker) |
| `YOUTUBE_API_KEY` | Optional | Google Cloud Console → APIs & Services → enable YouTube Data API v3 → Create credentials → API key |
| `APIFY_TOKEN` | Optional | apify.com → Settings → Integrations → API token (enables Reddit + Instagram scraping) |
| `CRON_SECRET` | Optional | Any secret string; used to secure Vercel Cron calls |

Redeploy after changing env vars.

---

## 2. RunPod worker (for AI sample generation)

1. **RunPod account:** [runpod.io](https://runpod.io) → sign up.
2. **Create a Serverless endpoint:**  
   RunPod → **Serverless** → **+ New Endpoint** → choose GPU (e.g. A100), use the Docker image from `worker/` (see [worker/README.md](worker/README.md)).
3. **Endpoint environment variables** (in RunPod endpoint settings):  
   `WORKER_SECRET`, `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `HF_TOKEN` for Hugging Face.
4. **Get credentials:**  
   RunPod → **Settings** → **API Keys** → create key.  
   RunPod → **Serverless** → your endpoint → copy **Endpoint ID**.
5. **Give them to the app:**  
   Either set **Vercel** env vars `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID`, or in the app go to **Admin → Leads** → open **Worker (RunPod)** → paste API key and Endpoint ID → **Save worker credentials**.

After this, **Run scrape** and **Enqueue samples** will create jobs and RunPod will run them.

---

## 3. Optional: more leads from scrape

- **YouTube:** Set `YOUTUBE_API_KEY` in Vercel (see table above).
- **Reddit / Instagram:** Set `APIFY_TOKEN` in Vercel (from apify.com). Same token is used for both.

---

## 4. Check that everything is set

In the app: **Admin → Leads**. Open **Setup checklist** (if shown). It shows which of the above are configured. Fix any missing items in Vercel or in the Worker section on that page.

---

## 5. Deploy

Push to `main` to trigger Vercel deploy (or deploy from the Vercel dashboard). After deploy, run **Run scrape** and **Enqueue samples** from Admin → Leads to verify.
