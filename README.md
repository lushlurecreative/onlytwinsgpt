This is a [Next.js](https://nextjs.org) project for ONLYTWINS.

## How this app runs

**The app runs on Vercel only.** You do not run it on your computer. Set environment variables in Vercel (see [SETUP.md](SETUP.md)), push to `main` (or deploy from the Vercel dashboard), and use your live URL. No local run is required.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Lead Scraping (Admin)

The Lead Pipeline scrapes YouTube and Reddit for creator leads. To enable YouTube:

1. Create an API key at [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → YouTube Data API v3
2. Add `YOUTUBE_API_KEY` to your Vercel project environment variables

Without it, only Reddit is scraped (and demo leads are used when both return empty).

## ONLYTWINS image pipeline (RunPod worker)

Image generation uses a **RunPod worker** (FLUX + LoRA + IP-Adapter + ControlNet + Real-ESRGAN), not OpenAI. The app creates **training_jobs** and **generation_jobs** and polls until the worker completes them.

- **App env:** Set `WORKER_SECRET` (shared secret). The worker calls internal APIs with `Authorization: Bearer {WORKER_SECRET}` or `X-Worker-Secret`.
- **Worker env:** See [worker/README.md](worker/README.md). Required: `WORKER_SECRET`, `APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Supabase URL. Optional: `DATABASE_URL` for direct Postgres.
- **Supabase:** Ensure the **model_artifacts** bucket exists (private). After deploy, call `POST /api/internal/setup/storage` with `Authorization: Bearer {WORKER_SECRET}` from your deployment. See [worker/README.md](worker/README.md) runbook for full steps.

Without the worker running and `WORKER_SECRET` set, lead generate-sample and generation-requests image generation will time out or fail.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
