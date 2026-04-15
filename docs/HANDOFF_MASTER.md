# Handoff Master

Last updated: 2026-04-14 (session: Phase 1 real-world intake pipeline built + smoke-tested)

## Project goal

OnlyTwins — production AI content generation SaaS. Paid subscriber pipeline: subscribe → upload training photos → train LoRA → generate identity-preserving content → deliver to library. Target: $80k–$150k/month.

## Current status

**Phase 1 real-world training intake pipeline is built end-to-end and smoke-tested on a real 26-photo dataset.** Previous curated-crop assumption dropped. The pipeline detects faces (InsightFace buffalo_l), builds a reference identity embedding from the top-3 frontal faces, rejects no-face / wrong-person (cosine < 0.45) / blurry (Laplacian < 40) / extreme-angle (yaw > 45°) / too-small (< 64 px) / duplicate (pHash Hamming ≤ 6) frames, emits 512 px face tiles + 768 px upper-body tiles, and writes a structured `intake_report` to the training job.

**Smoke test (26 real PNGs in `test-fixtures/identity-reset/person-a/`):** 20 accepted, 0 auto-fixed, 6 rejected (3 BLURRY, 2 WRONG_PERSON, 1 UNUSABLE_ANGLE), 28 filtered tiles emitted, dominant_identity_ratio 0.857, `ready_for_training=true`. Pipeline wallclock on CPU: 36 seconds.

**Intake limits reconciled to 15–25** across customer upload UI, admin training, vault generate-my-twin, and generation-requests routes via new `lib/intake.ts`. Upload copy rewritten to explain that preprocessing auto-rejects bad frames, so users don't need to curate.

**Phase:** Phase A verification — intake + preprocessing layer now closed. Next is running the real training job against the 28-tile filtered set, then visually scoring identity fidelity.

**Production deployment:** `main` at commit `daa0cc7`. RunPod endpoint `bd5p04vpmrob2u` operational. Migration `202604140001_identity_models_intake_report.sql` NOT YET applied — it must run before the next training job, otherwise the worker's PATCH of `intake_report` will fail.

## Active bugs

| Bug file | Status | Summary |
|----------|--------|---------|
| `BUG_infiniteyou_quality.md` | ACTIVE | LoRA identity correctness. Preprocessing + intake pipeline now built and validated. Awaiting live training run against 28-tile filtered set. |
| `BUG_worker_startup.md` | RESOLVED | Container crash-loop fixed; workers cycle cleanly. |
| `BUG_generation_503.md` | DEFERRED | `GENERATION_ENGINE_ENABLED` env gating — config issue, not blocking. |
| `BUG_onboarding_pending.md` | See file | Onboarding flag race. |
| `BUG_vault_role_rls.md` | CLOSED | Theoretical, confirmed not triggering. |
| `BUG_webhook_race.md` | RESOLVED | Closed by dedup index. |

## Changes made recently

### Phase 1 real-world intake pipeline (this session)
- **New worker module:** `worker/preprocess_intake.py` (CLI + importable). Uses InsightFace buffalo_l; thresholds: cosine 0.45, blur Laplacian 40, min face 96 px (borderline 64), max face-tile upscale 4x, dominant-identity ratio 0.70, pHash Hamming ≤ 6, min filtered tiles 12.
- **New shared constants file:** `lib/intake.ts` — `MIN_INTAKE_PHOTOS=15`, `MAX_INTAKE_PHOTOS=25`, `MIN_FILTERED_TILES=12`, `IntakeReport` type, rejection-reason enum, customer-facing copy.
- **New migration:** `supabase/migrations/202604140001_identity_models_intake_report.sql` — adds `intake_report jsonb` column + partial index on `ready_for_training='false'`.
- **Worker wiring:** `worker/main.py::run_training_job` now runs preprocessing before `train_and_save`, PATCHes the report back to the app, fails the job with structured `failure_reason` if not ready, and feeds only filtered tiles into training.
- **App wiring:** `app/api/internal/worker/training-jobs/[jobId]/route.ts` accepts `intake_report` in PATCH body and persists via new `lib/identity-models.ts::setIntakeReport()` (with `logJobEvent`).
- **UI + route limit reconciliation to 15–25:** `app/upload/UploadClient.tsx`, `app/api/vault/generate-my-twin/route.ts`, `app/api/admin/users/[userId]/training/route.ts`, `app/api/generation-requests/route.ts`. Upload copy rewritten; all three formerly divergent limits now bind to shared constants.
- **Local smoke-test dep env:** `.venv-intake/` (Python 3.10, numpy<2, opencv-python-headless<4.10, insightface, onnxruntime CPU) — used for local smoke-test only; not shipped to worker container.

### Pre-session (already in repo, unchanged)
- `RUNPOD_MODE` system (mock/cheap/production) in `lib/runpod.ts`.
- Worker startup guard (`b1556fb`).
- Dashboard upload-photo buttons point at canonical `/upload` (`daa0cc7`).

## Known facts

- Active identity model for the sole test user: **none** (0 active, 0 ready-active). v8 remains archived.
- Supabase Storage path convention for training photos: `uploads/{user_id}/training/{uuid}-{filename}`. Bucket: `uploads`.
- Customer upload, admin training, vault self-serve, and generation-requests routes now all enforce **15–25** uniformly via `lib/intake.ts`.
- Mock pipeline still passes 6/6 checks in 2.3s without GPU.
- FLUX LoRA base: `FLUX.1-dev`, default training backend `runpod`, `createModelRecord()` in `lib/identity-models.ts`.
- Dataset `test-fixtures/identity-reset/person-a/` contains 26 real PNGs (not 20 JPEGs as originally described). Preprocessing output at `test-fixtures/identity-reset/person-a-out/` with 28 tiles and `intake_report.json`.
- The worker container's `requirements-full.txt` already includes `insightface>=0.7.3`, `onnxruntime-gpu>=1.16.0`, and `opencv-python-headless>=4.8.0` — Phase 1 preprocessing adds no new deps to the RunPod image.

## Open hypotheses

1. **A training run against the 28 filtered tiles will produce an identity-correct LoRA in one shot.** Cosine match ≥ 0.45 on 20/26 real frames + 0.857 dominant ratio suggests the filter is doing its job. Testable by dispatching the training job now that the migration has run.
2. **The 0.45 cosine threshold may be slightly loose.** Two accepted frames sit at 0.48 (6.05.57 PM and 6.27.48 PM). If the trained model shows identity drift, tightening to 0.50 is the first knob to turn.
3. **Upper-body tiles may hurt more than help for LoRA identity.** They help pose/context variety but dilute face-region weight. If v9 underperforms v8 on face identity, first ablation is face-tiles-only.

## Next best single step

Apply migration `supabase/migrations/202604140001_identity_models_intake_report.sql` in Supabase SQL Editor (idempotent, adds `intake_report jsonb` column + partial index), then dispatch one training job through the worker against the already-filtered 28-tile set. Compare visual identity fidelity of the resulting LoRA against the archived v8 on a fixed prompt set.
