# Handoff Master

Last updated: 2026-04-04 (session: System 2 — Model Training Registry)

## Project goal

OnlyTwins — production AI content generation SaaS. Paid subscriber pipeline: subscribe → upload training photos → train LoRA → generate identity-preserving content → deliver to library. Target: $80k-$150k/month.

## Current status

System 1 (Training Intake) and System 2 (Model Training Registry) are implemented, migrated to production, and deployed. The subscriber pipeline now has: photo upload → validation → readiness gating → training job creation → versioned model registry → artifact storage → active model resolution for generation.

**Phase:** Phase A (Revenue Reliability) → subscriber pipeline buildout. Systems 1 and 2 complete. System 3 (Generation) is next.

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

### System 2 — Model Training Registry (IMPLEMENTED + DEPLOYED)

**Migrations applied to production:**

| Migration | What it does |
|-----------|-------------|
| `202604040001_training_photo_sets_and_photos.sql` | `training_photo_sets` + `training_photos` tables, RLS, indexes, `photo_set_id` FK on `training_jobs` (System 1 prerequisite — was pending deploy) |
| `202604040002_identity_models.sql` | `identity_models` table with versioning, unique partial index (one active per user), RLS, `updated_at` trigger, `activate_identity_model` atomic RPC |

**New files:**

| File | Purpose |
|------|---------|
| `lib/identity-models.ts` | Core model registry: create, complete, fail, activate (via atomic RPC), resolve lora, get history |
| `app/api/training/models/route.ts` | GET list all model versions for user |
| `app/api/training/models/[modelId]/activate/route.ts` | POST set a specific model as active |

**Modified files:**

| File | Change |
|------|--------|
| `app/api/training/route.ts` | Creates `identity_model` record (queued → training) on training job start |
| `app/api/internal/worker/training-jobs/[jobId]/route.ts` | Updates identity_model with artifacts on completion, failure_reason on failure. Accepts new fields: adapter_path, preview_image_path, training_steps, network_dim, network_alpha, learning_rate, caption_strategy |
| `app/api/webhooks/runpod/route.ts` | Updates identity_model on webhook COMPLETED/FAILED callbacks |
| `app/api/training/status/route.ts` | Returns `activeModel` + `modelHistory` alongside existing training status |
| `app/dashboard/DashboardClient.tsx` | Shows model version number in status pill (e.g. "Model ready (v2)") |
| `lib/generation-jobs.ts` | `getLoraReferenceForSubject` resolves from active identity_model first, falls back to legacy `subjects_models` |
| `app/api/admin/users/[userId]/training/route.ts` | Creates identity_model on admin-triggered training |

## Known facts

- `identity_models` table: one row per training run, auto-versioned per user
- Active model enforced at DB level: unique partial index `(user_id) WHERE is_active = true`
- Activation uses Postgres RPC `activate_identity_model` — atomic deactivate-old + activate-new
- `completeModel()` is idempotent — skips if status already `ready`
- Generation resolution: identity_models (active) → subjects_models (legacy fallback)
- Worker PATCH endpoint now accepts artifact metadata (training_steps, network_dim, etc.)
- Both webhook and worker PATCH update identity_model — race-safe (webhook notes completion timestamp, worker stores artifacts and promotes to ready)
- If worker never PATCHes after RunPod COMPLETED webhook, model stays at `training` forever — no reconciliation job yet

## Infrastructure

| Component | Details |
|-----------|---------|
| ComfyUI pod | `uezkz34ux59drh`, RTX A6000 48GB |
| RunPod serverless | Endpoint `bd5p04vpmrob2u` |
| Docker image | `lushlurecreative/onlytwinsgpt-worker:latest` |

## What remains (Systems 3-4)

| System | Key gaps |
|--------|----------|
| **S3: Generation** | No dedicated `/generate` page. No `generation_outputs` table (outputs are paths on job rows). No scene browse catalog for subscribers. No on-demand generation UX. No preview generation from trained models |
| **S4: Ops** | No `job_events` table. No user-facing failure notifications (only admin alerts). No cancellation support. No reconciliation for orphaned training-status models. No comprehensive retry beyond RunPod dispatch |

## Single next objective

**Build System 3 (Generation System)** — the pipeline from a ready/active model to generated content. Start with: generation request creation using active identity_model, on-demand generation UX, output tracking, and delivery to library/vault.
