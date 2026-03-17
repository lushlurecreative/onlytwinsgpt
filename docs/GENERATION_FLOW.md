# Generation Flow

## Overview

AI content generation is handled by RunPod serverless GPU workers. The platform supports both image generation and model training.

## Image Generation Flow

```
1. Customer submits generation request
   → POST /api/generation-requests (or via /requests page)
   → Inserted into generation_requests table (status: pending)

2. Cron triggers processing
   → /api/cron/process-customer-generation (daily 12pm UTC)
   → /api/cron/monthly-customer-generation (daily midnight UTC)
   → lib/customer-generation.ts → lib/customer-generation-processor.ts

3. Job submitted to RunPod
   → lib/runpod.ts → RunPod API
   → generation_jobs row created (runpod_job_id stored)

4. RunPod calls back on completion
   → POST /api/webhooks/runpod
   → Result images stored in Supabase Storage
   → generation_jobs.status → completed
   → generation_requests.status → completed

5. Customer views results
   → /vault or /results page
   → Images served from Supabase Storage
```

## Model Training Flow

```
1. Customer uploads training photos
   → /upload page
   → Files stored in Supabase Storage

2. Training job submitted
   → lib/runpod.ts → RunPod training endpoint
   → training_jobs row created

3. RunPod calls back on completion
   → POST /api/webhooks/runpod (training variant)
   → training_jobs.status → completed
   → Model ID stored for future generation
```

## Key Files

| File | Purpose |
|---|---|
| `lib/customer-generation.ts` | Top-level orchestration |
| `lib/customer-generation-processor.ts` | Batch job processing |
| `lib/generation-engine.ts` | Core generation logic |
| `lib/generation-jobs.ts` | Job state management |
| `lib/generation-request-intake.ts` | Request validation |
| `lib/request-planner.ts` | Request planning and limits |
| `lib/image-generation.ts` | Image generation wrapper |
| `lib/image-quality.ts` | LLaVA-based quality filtering |
| `lib/video-generation.ts` | Video generation |
| `lib/runpod.ts` | RunPod API client |
| `app/api/webhooks/runpod/route.ts` | RunPod completion webhook |
| `app/api/internal/worker/jobs/route.ts` | Worker job pull endpoint |

## Worker Authentication

Internal endpoints (`/api/internal/**`) require:
```
X-Worker-Secret: <WORKER_SECRET env var>
```

Worker endpoints:
- `GET /api/internal/worker/jobs` — pull next pending job
- `PUT /api/internal/worker/generation-jobs/[jobId]` — update job status/result
- `PUT /api/internal/worker/training-jobs/[jobId]` — update training status
- `GET /api/internal/worker/subjects/[subjectId]` — get subject data
- `GET /api/internal/worker/presets/[presetId]` — get preset config
- `POST /api/internal/watermark/log` — log watermark event

## GPU Usage Tracking

All RunPod jobs log GPU usage to `gpu_usage` table for cost analysis.
- Viewed in `/admin/cost` and `/admin/worker`

## Job Reaper

Cron job at `/api/cron/job-reaper` cleans up stuck/failed jobs.

## Lead Sample Generation

Separate from customer generation — generates sample images for scraped leads:
- `/api/cron/enqueue-lead-samples` (9am UTC) — queues sample jobs
- Results stored in `leads_sample_paths`
- Used by admin for outreach personalisation
