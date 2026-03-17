# Lead Automation

## Overview

The lead pipeline runs automatically: scrape potential creators → ingest and score → generate a sample → send outreach → monitor for replies → convert to paying customer.

## Pipeline stages

```
scrape → ingest/score → qualify → sample generation → outreach → reply poll → conversion
```

---

## 1. Scraping

Scrapers pull potential creator profiles from:
- **YouTube** — requires `YOUTUBE_API_KEY`
- **Reddit** / **Instagram** — requires `APIFY_TOKEN` (Apify service)

Scraper output feeds directly into the ingest pipeline.

---

## 2. Ingest and scoring (`lib/ingest-leads.ts`)

**Route:** `POST /api/admin/leads/ingest` (admin only)

**Deduplication key:** `(source, handle, platform)` — upserts on this combination. If a lead already exists, it is updated, not duplicated.

**Scoring:**

| Condition | Score added |
|---|---|
| Base | 0 |
| 5+ samples found | +5 |
| 10+ samples found | +10 |
| Face filter passed (if enabled) | included in above |

Face filter gate:
- Only active if `FACE_FILTER_ENABLED=true` AND `REPLICATE_API_TOKEN` is set
- Calls LLaVA via Replicate (`lib/image-quality.ts` → `passesFaceAndWaistUp()`)
- Filters out images that don't contain a clear face and waist-up framing

**Status set at ingest:**
- `"qualified"` — if score ≥ 10 AND 3+ sample images found
- `"new"` — everything else

**Minimum samples to save:** `MIN_SAMPLES_TO_SAVE=1` env var (default: 1). Leads with zero samples are not saved.

**Database client fallback:** If Supabase client fails (e.g. RLS block), falls back to a raw pg client using `DATABASE_URL` directly.

---

## 3. Sample generation

Qualified leads can have a sample AI image generated to include in outreach.

- Uses `createGenerationJob()` from `lib/generation-jobs.ts` with `job_type: "lead_sample"` and `lead_id`
- Dispatched to RunPod like any customer generation job
- On completion: RunPod webhook updates `leads.sample_asset_path` and sets `leads.status = "sample_generated"`
- Inserts an `automation_events` row for tracking

---

## 4. Outreach (`lib/outreach.ts`)

**Route:** `POST /api/admin/leads/[leadId]/outreach` (admin only)

**Delivery:**
1. If `OUTREACH_WEBHOOK_URL` is set: sends a POST to that URL (Zapier, Make, n8n, or any HTTP endpoint)
2. Fallback: calls `sendAlert()` (internal notification)

**What happens:**
1. Builds outreach message from template (uses `{handle}` interpolation)
2. Inserts `outreach_logs` row with `delivery_status: "pending"`
3. Updates `leads.status = "contacted"`
4. Appends message to `leads.notes`

**Lead status after outreach:** `outreach_queued` → `contacted`

---

## 5. Reply polling

Admin manually checks replies or a polling mechanism monitors the outreach channel. No automated reply polling is built yet — reply handling depends on the external platform used with `OUTREACH_WEBHOOK_URL`.

---

## 6. Conversion

When a lead pays:
1. Lead's email is included in Stripe checkout metadata as `lead_id`
2. `checkout.session.completed` webhook calls `convert_lead_to_customer()` RPC
3. Lead status → `converted`
4. `automation_events` row inserted

**Known issue:** Lead status update also runs in `customer.subscription.created` handler — causes duplicate `automation_events` rows. Fix: remove duplicate from that handler. See `docs/current-known-issues.md` Issue #4.

---

## Lead status machine

| Status | Meaning |
|---|---|
| `new` | Ingested, not yet qualified |
| `qualified` | Score ≥ 10, 3+ samples |
| `sample_generated` | RunPod sample job completed |
| `outreach_queued` | Outreach job enqueued |
| `contacted` | Outreach delivered |
| `converted` | Paid and provisioned as customer |
| `rejected` | Manually rejected by admin |

---

## Key tables

| Table | Purpose |
|---|---|
| `leads` | Lead record with status, score, sample_asset_path, notes |
| `outreach_logs` | Per-outreach delivery records with status |
| `automation_events` | Audit trail for all lead lifecycle events |

---

## Admin UI

- **Leads list:** `/admin/leads` — sortable, filterable by status
- **Lead detail:** `/admin/leads/[leadId]` — full lead record, outreach history, sample preview
- **Outreach action:** available from lead detail page

---

## Env vars required

| Variable | Required for |
|---|---|
| `YOUTUBE_API_KEY` | YouTube scraping |
| `APIFY_TOKEN` | Reddit/Instagram scraping |
| `REPLICATE_API_TOKEN` | Face quality filtering |
| `FACE_FILTER_ENABLED` | Set `"true"` to activate face filter |
| `OUTREACH_WEBHOOK_URL` | Outreach delivery (Zapier/Make/n8n) |
