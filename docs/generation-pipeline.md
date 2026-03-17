# Generation Pipeline

## Overview

Customers save a generation mix (photo/video requests with prompts). The system creates a batch, dispatches individual jobs to RunPod, and delivers results to the customer's vault.

## Feature flag

`lib/generation-engine.ts` → `isGenerationEngineEnabled()` checks `GENERATION_ENGINE_ENABLED=true` env var. All generation entry points check this. If disabled, they return `503`.

## Mix save flow

**Route:** `PUT /api/me/request-preferences`

```
1. Verify auth session
2. getCurrentSubscriptionSummary() — check status + plan allowance
3. normalizeMixLines(body.allocationRows) — validate and normalise
4. Check totals <= plan allowance (photos: includedImages, videos: includedVideos)
5. Upsert to app_settings key "request_mix:{userId}"
6. upsertRecurringMixForTargetCycle() → recurring_request_mixes table
7. Check eligibility:
   - Not active/trialing/past_due → generationState = "saved_pending_eligibility"
   - < 10 training photos in storage → generationState = "saved_pending_training"
   - Existing request for this cycle → generationState = "current_cycle_already_queued"
   - Otherwise → createCanonicalCustomerGenerationBatch() → processPendingCustomerGeneration()
                  generationState = "queued_now"
```

**Idempotency key format:** `request-mix-save:{userId}:{cycleStartIso.slice(0, 10)}`

## Batch creation (`lib/customer-generation.ts`)

`createCanonicalCustomerGenerationBatch(admin, input)`:
1. Check `isGenerationEngineEnabled()`
2. `getCurrentSubscriptionSummary()` — verify eligible status
3. `normalizeMixLines()` — validate lines
4. Check totals against plan allowance
5. `autoFillAllowance()` — fill remaining allowance with default prompts if under-allocated
6. Infer `scenePreset` and `contentMode` from prompts
7. `createGenerationRequestWithUsage()` — insert `generation_requests` row (with usage ledger)
8. Update `generation_requests` with source, cycle dates, mix snapshot, progress total
9. Insert `generation_request_lines` rows (one per mix line)
10. Return `{ok: true, generationRequestId, lines, autoFilledLines, totals}`

**Sources:** `manual_save`, `monthly_scheduler`, `api_generation_request`, `vault_generate`, `generate_images`

## Monthly scheduler (`lib/customer-generation-processor.ts`)

`scheduleMonthlyCustomerBatches(admin, maxSubscribers=200)`:
1. Check `isGenerationEngineEnabled()`
2. Query `subscriptions` for active/trialing/past_due (up to 200)
3. For each unique subscriber:
   - Compute cycle window from `current_period_end`
   - Check no existing `generation_requests` for this cycle (skip if exists)
   - Look up `recurring_request_mixes` for this cycle (skip if no saved mix)
   - Check >= 10 training photos in Supabase Storage (skip if fewer)
   - `createCanonicalCustomerGenerationBatch()` with `source: "monthly_scheduler"`
   - Idempotency key: `monthly-cycle:{userId}:{cycleStart.slice(0, 10)}`

**Triggered by:** `POST /api/cron/monthly-customer-generation` (daily at midnight UTC)

## Job processing (`lib/customer-generation-processor.ts`)

`processPendingCustomerGeneration(admin, maxBatches=10)`:
1. Check `isGenerationEngineEnabled()`
2. Query `generation_requests` where `status = 'pending'` and `cycle_start <= now`
3. For each (up to maxBatches):
   a. `claimRequest()` — atomic UPDATE to `status = 'generating'` only if still `pending`
   b. `getApprovedSubjectIdForUser()` — must exist or mark failed
   c. `getLoraReferenceForSubject()` — LoRA model reference
   d. `ensureLines()` — load from `generation_request_lines` (or rebuild from `mix_snapshot_json`)
   e. For each photo line: `getPresetIdBySceneKey()` → `createGenerationJob()` → update job with `generation_request_line_id` and `prompt_override`
   f. If no jobs created: mark request as `failed`

**Note:** Only photo lines are processed currently (line 130: `if (line.line_type !== 'photo') continue`)

**Triggered by:**
- `POST /api/cron/process-customer-generation` (daily at 12pm UTC) — processes up to 25
- `POST /api/cron/monthly-customer-generation` — processes up to 25 after scheduling
- `PUT /api/me/request-preferences` — processes up to 5 after immediate batch creation

## RunPod job dispatch (`lib/generation-jobs.ts`)

**Key functions:**

`getApprovedSubjectIdForUser(userId)` — queries `subjects` where `consent_status = 'approved'`. Returns null if no approved subject.

`getLoraReferenceForSubject(subjectId)` — queries `subjects_models` where `training_status = 'completed'`. Returns `lora_model_reference` string (RunPod model path).

`getPresetIdBySceneKey(sceneKey)` — calls `getScenePresetByKey(sceneKey)` from `lib/scene-presets.ts`, then queries `presets` table by `name ilike preset.label`. Returns `presets.id`.

`createGenerationJob(input)`:
- Input: `{ subject_id, preset_id, reference_image_path, lora_model_reference, generation_request_id, job_type, lead_id? }`
- `job_type`: `"user"` (customer generation) or `"lead_sample"` (lead pipeline sample)
- Inserts `generation_jobs` row
- Immediately dispatches to RunPod via `dispatchGenerationJobToRunPod()` from `lib/runpod.ts`
- RunPod webhook URL: `{APP_URL}/api/webhooks/runpod`
- Stores returned `runpod_job_id`

**Poll functions (blocking — for admin/testing use):**
- `pollGenerationJobUntilDone(jobId)` — polls every 2s, 5-minute timeout
- `pollAllGenerationJobsUntilDone(jobIds)` — runs all in parallel

## Worker callback (`app/api/webhooks/runpod/route.ts`)

**Route:** `POST /api/webhooks/runpod`

No authentication check on this route. RunPod calls it with job ID and final status.

**On FAILED / TIMED_OUT / CANCELLED:**
1. Try to match `training_jobs` first (by `runpod_job_id`). If found: update `status = 'failed'`, set `admin_notes`, done.
2. Otherwise match `generation_jobs`. For `job_type = "user"` jobs:
   - Check `dispatch_retry_count < GENERATION_JOB_MAX_RETRIES` (env var, default `2`)
   - If under limit: increment `dispatch_retry_count`, re-dispatch to RunPod, update `runpod_job_id`
   - If at limit: mark `status = 'failed'`, set `admin_notes`
3. Call `syncCustomerRequestState(admin, generationRequestId)` to update parent request

**On COMPLETED:**
1. Try to match `training_jobs` first. If found: update `status = 'completed'`, set `finished_at`, log to `system_events`. Done.
2. Otherwise match `generation_jobs`:
   - Update `output_path`, `status = 'completed'`
   - If `job_type = 'lead_sample'` and `lead_id` present:
     - Update `leads.sample_asset_path = output_path`
     - Update `leads.status = 'sample_generated'`
     - Insert `automation_events` row
3. Call `syncCustomerRequestState(admin, generationRequestId)`

**`syncCustomerRequestState(admin, requestId)`:**
1. Query all `generation_jobs` for the request
2. For each completed job, call `ensurePost(output_path, requestId, userId)` — inserts a `posts` row with `visibility: "subscribers"`, `is_published: false` if not already exists
3. If any jobs still in-flight: update `generation_requests.status = 'generating'` with partial `output_paths`
4. If video lines needed: trigger video generation from completed images
5. If all jobs done: update `generation_requests.status = 'completed'` or `'failed'`

## Internal worker API

Workers pull jobs via authenticated REST calls:
- `GET /api/internal/worker/jobs` — claim next pending job (`X-Worker-Secret` required)
- `PUT /api/internal/worker/generation-jobs/[jobId]` — update status/result
- `PUT /api/internal/worker/training-jobs/[jobId]` — update training status
- `GET /api/internal/worker/subjects/[subjectId]` — get subject data
- `GET /api/internal/worker/presets/[presetId]` — get scene preset config
- `POST /api/internal/watermark/log` — log watermark event to `watermark_logs`

## Cycle timing

`lib/request-planner.ts` → `computeCutoff(nextRenewalAt)`:
- If current date is more than 5 days before renewal: `appliesTo = "next_cycle"`
- Within 5 days of renewal: `appliesTo = "following_cycle"`

Cycle length: 30 days from `current_period_end`.

## Training photos requirement

- Minimum 10 photos required for generation to proceed
- Photos read from Supabase Storage bucket `uploads` under path `{userId}/training/`
- Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`
- Up to 10 sample paths used for batch creation; up to 20 for monthly scheduler

## Generation job fields

Key fields on `generation_jobs` (beyond standard):
- `job_type` — `"user"` or `"lead_sample"`
- `lead_id` — FK to `leads` table (lead sample jobs only)
- `generation_request_line_id` — FK to `generation_request_lines`
- `prompt_override` — custom prompt for this line
- `dispatch_retry_count` — number of RunPod retries attempted
- `lease_owner` / `lease_until` — atomic claim fields

## Generation request states

| State | Meaning |
|---|---|
| `pending` | Created, waiting to be claimed by processor |
| `generating` | Claimed, jobs being dispatched |
| `completed` | All jobs finished |
| `failed` | Processing failed (see `admin_notes` for reason) |

## RunPod configuration (`lib/runpod.ts`)

Config is resolved in this priority order:
1. Env vars: `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`
2. `app_settings` table rows: key `runpod_api_key`, `runpod_endpoint_id`

Timeouts:
- Training jobs: 2 hours
- Generation jobs: 15 minutes

`getRunPodHealth()` — called by admin worker panel to check endpoint status.
