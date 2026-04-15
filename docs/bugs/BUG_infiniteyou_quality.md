# Bug: Face identity preservation

## Status: ACTIVE — Phase 1 preprocessing pipeline built and validated; awaiting live training run (2026-04-14)

Previous HyperSwap face-swap work superseded. The current instance of this bug is LoRA identity correctness, not face-swap post-processing.

## Expected behavior

A trained identity model generates images where the subject is unambiguously the same person as the uploaded training photos — same face proportions, same distinctive features — across varied prompts and poses. The system accepts realistic camera-roll uploads (selfies + chest-up + waist-up + some full-body, mixed lighting, occasional bad frames, possible contamination) and enforces identity integrity through preprocessing, not through user curation.

## Actual behavior

Identity v8 (`c07e4f66-c94a-4baf-806b-165e03f20c0c`) produced outputs that did not match any single real person because the training set contained photos of more than one individual. The LoRA learned a blended face. v8 is archived. No retrained model exists yet; the 28-tile filtered set is ready but training has not been dispatched.

## Confirmed facts

- Worker startup crash-loop is resolved; training and generation both run end-to-end on the worker.
- Identity v8 row in Supabase remains `is_active=false`, `status='archived'`. User `5f6e59db-dbd9-4402-bb55-9fa58074fdcc` has 0 active / 0 ready-active models.
- Phase 1 preprocessing pipeline is built: `worker/preprocess_intake.py` (InsightFace buffalo_l detect → ArcFace embed → top-3 frontal reference → per-face cosine match → blur/angle/size gates → pHash dedupe → 512 px face tile + 768 px upper-body tile emit → structured `intake_report`).
- Thresholds in use: cosine 0.45, blur Laplacian 40, min face 96 px (borderline 64), pose yaw 45°, dominant-identity ratio 0.70, min filtered tiles 12, max face-tile upscale 4x, pHash Hamming ≤ 6.
- Intake limits unified to **15–25 photos** across customer upload UI, admin training, vault generate-my-twin, and generation-requests routes via new `lib/intake.ts`.
- New `supabase/migrations/202604140001_identity_models_intake_report.sql` adds `intake_report jsonb` to `identity_models` (plus partial index on `ready_for_training='false'`). **NOT YET APPLIED** — must run before the next training job.
- Worker and app are wired: `worker/main.py::run_training_job` runs preprocessing, PATCHes the report via `app/api/internal/worker/training-jobs/[jobId]/route.ts` → `lib/identity-models.ts::setIntakeReport()`, and feeds only filtered tiles into `train_and_save`.
- Smoke test on 26 real PNGs at `test-fixtures/identity-reset/person-a/`: 20 accepted, 0 auto-fixed, 6 rejected (3 BLURRY, 2 WRONG_PERSON, 1 UNUSABLE_ANGLE), 28 tiles emitted (20 face + 8 upper-body), dominant_identity_ratio 0.857, `ready_for_training=true`, 36 sec on CPU. Output at `test-fixtures/identity-reset/person-a-out/` including `intake_report.json`.
- Worker container's `requirements-full.txt` already has `insightface>=0.7.3`, `onnxruntime-gpu>=1.16.0`, `opencv-python-headless>=4.8.0` — preprocessing adds zero new runtime deps.

## Things tried

| Change | Commit / session | Result |
|--------|------------------|--------|
| Previous face-swap track (inswapper → GFPGAN → Delaunay → PuLID → HyperSwap) | pre-2026-04-14 | Superseded. Not the current identity failure mode. |
| Train identity v8 on 10 screenshots | pre-session | Mixed-identity set → blended-face LoRA → invalid |
| Archive v8 + clear active model state | 2026-04-14 earlier | Complete. User has 0 active models. |
| Redesign intake assumptions around real camera-roll uploads | 2026-04-14 earlier | Policy drafted. |
| Build preprocessing pipeline (detect + embed + cluster + crop + dedupe + filter) | 2026-04-14 this session | `worker/preprocess_intake.py` built; smoke-tested on real 26-photo set; 20/26 accepted; 28 tiles emitted; ready_for_training=true. |
| Reconcile customer/admin/vault intake limits to 15–25 | 2026-04-14 this session | `lib/intake.ts` is now single source of truth; 4 routes updated. |
| Add `intake_report jsonb` column + wire worker → app | 2026-04-14 this session | Migration file written; PATCH route accepts it; `setIntakeReport()` persists + logs. |
| Tile-upscale gate bug (first smoke run emitted only 10 tiles for 20 accepted files) | 2026-04-14 this session | Fixed: face tiles now upscale up to 4x; upper-body tiles still never upscale. Re-ran to confirm 28 tiles. |

## Next single step

Apply `supabase/migrations/202604140001_identity_models_intake_report.sql` in Supabase SQL Editor, then dispatch one training job through the worker against the 28-tile filtered set. Score the resulting LoRA (visually) against a fixed prompt set and compare identity fidelity to archived v8. If identity drift appears, first knob to tighten is the cosine threshold (0.45 → 0.50); second is disabling the upper-body tiles and training face-tiles-only.
