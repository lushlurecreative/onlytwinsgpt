# Handoff Master

Last updated: 2026-04-04 (session: Pipeline Audit + System 1 Build)

## Project goal

OnlyTwins — production AI content generation SaaS. Paid subscriber pipeline: subscribe → upload training photos → train LoRA → generate identity-preserving content → deliver to library. Target: $80k-$150k/month.

## Current status

Full codebase audit completed across all 4 pipeline systems. System 1 (Training Intake) implemented — photo sets, per-photo validation, readiness gating, training integration. Systems 2-4 have working foundations but gaps remain.

**Phase:** Phase A (Revenue Reliability) moving into subscriber pipeline buildout.

## Active bugs

| Bug file | Status | Summary |
|----------|--------|---------|
| `BUG_infiniteyou_quality.md` | OPEN | HyperSwap 1c 256 deployed, awaiting E2E test |
| `BUG_generation_503.md` | See file | Generation endpoint errors |
| `BUG_onboarding_pending.md` | See file | Onboarding flag race |
| `BUG_vault_role_rls.md` | See file | RLS blocks role update |
| `BUG_webhook_race.md` | See file | Thank-you page race |
| `BUG_worker_startup.md` | See file | Worker startup issues |

## Changes made this session

### Pipeline Audit
Audited all 4 systems (Training Intake, Model Training, Generation, Ops). Found: training/generation core pipeline exists and works. Key gaps: no per-photo tracking, no photo validation, no dataset readiness gating, no model versioning, no dedicated generation page, no job events table.

### System 1 — Training Intake (IMPLEMENTED)

**New files:**

| File | Purpose |
|------|---------|
| `supabase/migrations/202604040001_training_photo_sets_and_photos.sql` | `training_photo_sets` + `training_photos` tables, RLS, indexes, `photo_set_id` FK on `training_jobs` |
| `lib/training-photo-sets.ts` | Photo set CRUD, readiness assessment, trainable path extraction |
| `lib/training-photo-validation.ts` | Server-side validation: dimensions, file size, aspect ratio, MIME, duplicates. Uses Range header for 64KB header fetch |
| `app/api/training/photo-sets/route.ts` | GET active set + POST create set |
| `app/api/training/photo-sets/[setId]/route.ts` | GET specific set with photos |
| `app/api/training/photo-sets/[setId]/validate/route.ts` | POST run validation on all photos |
| `app/api/training/photo-sets/[setId]/finalize/route.ts` | POST mark set as ready |
| `app/api/training/status/route.ts` | GET training job + model status for polling |

**Modified files:**

| File | Change |
|------|--------|
| `app/api/uploads/route.ts` | Creates `training_photos` record on upload, removes on delete |
| `app/api/training/route.ts` | Accepts `photoSetId`, validates set readiness, updates set status. Legacy bucket scan preserved. MAX_PHOTOS standardized to 50 |
| `app/api/webhooks/runpod/route.ts` | Updates photo set status on training completion/failure. Adds `training_complete` user notification |
| `app/training/photos/TrainingPhotosClient.tsx` | Rebuilt: shows set status bar, per-photo validation badges, readiness reasons, validate/start-training buttons |
| `app/training/photos/page.tsx` | Copy updated, GIF removed from accepted formats |
| `app/dashboard/DashboardClient.tsx` | Polls `/api/training/status`, shows model status pill |

## Known facts

- Photo count standardized: 10 min / 50 max everywhere (was 60 in training API)
- Photo sets track lifecycle: draft → uploaded → validating → ready → training → trained
- Per-photo validation checks: dimensions (min 512x512), file size (50KB-20MB), aspect ratio, MIME, duplicates
- Readiness requires: ≥10 photos, all validated (no pending), ≥60% pass rate
- Training webhook now updates photo set status and creates user notification
- Validation uses Range header (64KB) to avoid downloading full images
- RLS policies use `to service_role` correctly (verified in review)

## Infrastructure

| Component | Details |
|-----------|---------|
| ComfyUI pod | `uezkz34ux59drh`, RTX A6000 48GB |
| RunPod serverless | Endpoint `bd5p04vpmrob2u` |
| Docker image | `lushlurecreative/onlytwinsgpt-worker:latest` |

## What remains (Systems 2-4)

| System | Key gaps |
|--------|----------|
| **S2: Model Training** | No `identity_models` versioning table (single `subjects_models` row per subject, overwrites). No caption strategy. No training progress polling UI. No preview generation |
| **S3: Generation** | No dedicated `/generate` page. No `generation_outputs` table (outputs are paths on job rows). No scene browse catalog for subscribers. No on-demand generation UX |
| **S4: Ops** | No `job_events` table. No user-facing failure notifications (only admin alerts). No cancellation support. No comprehensive retry beyond RunPod dispatch |

## Deploy requirements for this session

1. **Run migration BEFORE code deploy**: `supabase/migrations/202604040001_training_photo_sets_and_photos.sql` in Supabase SQL Editor
2. No new env vars needed
3. Push to `main` triggers Vercel auto-deploy

## Single next objective

**Run the migration, deploy, and test the training photo upload → validate → ready → start training flow end-to-end with a real subscriber account.** Then begin System 2 (Model Training) — add `identity_models` table with versioning and training progress display.
