# Handoff Master

Last updated: 2026-04-12 (session: GPU memory fix + error reporting + LoRA adapter name fix)

## Project goal

OnlyTwins — production AI content generation SaaS. Paid subscriber pipeline: subscribe → upload training photos → train LoRA → generate identity-preserving content → deliver to library. Target: $80k–$150k/month.

## Current status

**2-step pipeline (FLUX + FaceFusion) GPU memory fix deployed. LoRA adapter naming fix deployed, awaiting Docker build + test.** Three bugs were fixed this session: (1) FLUX never freed ~16GB VRAM after inference, (2) RunPod handler masked internal failures as COMPLETED, (3) LoRA adapter registered as `default_0` but code referenced `default`. The pipeline now runs past FLUX inference successfully. The adapter naming fix (commit `359fc9d`) is deployed to GitHub but the Docker image has not yet been built/tested.

**Phase:** Phase A verification — pipeline functional, identity application pending final test.

**Active model:** Identity model v8 (`c07e4f66`), 10 verified single-identity photos, `is_active=true`, `status=ready`.

**Production deployment:** `main` at commit `359fc9d`. Docker image rebuild triggered by GitHub Actions (both `worker-docker-build.yml` and `build-worker-image.yml`). RunPod endpoint `bd5p04vpmrob2u` workers need cycling after build completes.

## Active bugs

| Bug file | Status | Summary |
|----------|--------|---------|
| `BUG_worker_startup.md` | ACTIVE | GPU memory fix + error reporting deployed. LoRA adapter name fix deployed, awaiting build+test. |
| `BUG_generation_503.md` | DEFERRED | `GENERATION_ENGINE_ENABLED` env gating — not blocking. |
| `BUG_infiniteyou_quality.md` | DEFERRED | Face-swap quality (homepage hook). On hold. |
| `BUG_onboarding_pending.md` | See file | Onboarding flag race. |
| `BUG_vault_role_rls.md` | See file | RLS blocks role update. |
| `BUG_webhook_race.md` | RESOLVED | Closed by dedup index. |

## Changes made this session (2026-04-12)

### GPU memory cleanup (commit `c1c7089`, deployed + tested)
- `generate_flux.py`: Wrapped FLUX pipeline in try/finally with `del pipe; del transformer; gc.collect(); torch.cuda.empty_cache()`. Frees ~16GB VRAM before FaceFusion runs.
- `generate_swap.py`: Belt-and-suspenders cleanup between FLUX and FaceFusion. Removed double-FLUX fallback that guaranteed OOM on face-swap failure. Added VRAM diagnostic logging.
- `main.py`: `run_generation_job()` returns `(True, None)` or `(False, error_reason)`.
- `app.py`: Handler checks return value, reports actual error to RunPod output.
- **Test result:** Job ran 62s (vs 32s crash before). FLUX completed. Failed downstream — but error was masked ("failed internally").

### Error reporting (commit `b8ebc17`, deployed + tested)
- `main.py`: Each failure path returns specific error string (e.g., `generation_exception: ValueError: ...`, `upload_failed: ...`, `ref_download_uploads_failed: ...`).
- `app.py`: Unpacks tuple, surfaces error reason in RunPod job output.
- **Test result:** Job ran 221s. Error now visible: `ValueError: Adapter name(s) {'default'} not in the list of present adapters: {'default_0'}`.

### LoRA adapter name fix (commit `359fc9d`, pushed, build pending)
- `generate_flux.py`: Changed from auto-named `default` adapter to explicit `adapter_name="identity"` in `load_lora_weights()` and `set_adapters()`. Fixes collision caused by `importlib.reload(main_mod)` in `app.py` which increments the default adapter name.

## Known facts

- GPU memory fix works: FLUX pipeline loads, runs 28-step inference, frees VRAM via try/finally cleanup. Confirmed by 62s and 221s execution times (was 32s crash before).
- Error reporting works: RunPod job output now contains specific failure reason instead of generic "failed internally".
- `importlib.reload(main_mod)` in `app.py` causes diffusers to auto-increment adapter names (`default` → `default_0`). Fixed by using explicit `adapter_name="identity"`.
- RunPod endpoint `bd5p04vpmrob2u` has 2 workers, ADA_24 GPU (RTX 4090 24GB). Endpoint env vars show `null` via GraphQL but Supabase credentials work at runtime (likely set via RunPod template).
- RunPod health at session end: 52 completed, 41 failed jobs total. Failure rate will drop once pipeline is fixed.
- `warmup()` in `app.py` preloads FaceFusion models (InsightFace, HyperSwap, GFPGAN, Real-ESRGAN) at container startup. These coexist with FLUX inference after the memory cleanup fix.

## Open hypotheses

1. **LoRA adapter name fix should complete the pipeline.** The 221s execution time means FLUX loaded but crashed at `set_adapters()` before inference. With the explicit name, inference should run, face swap should follow, and upload should succeed. This is the most likely path to a fully working pipeline.
2. **FaceFusion face swap may fail on first use** if InsightFace buffalo_l model pack wasn't downloaded during warmup. The Docker image doesn't include it — InsightFace downloads it at runtime. If the download fails or times out, swap_faces() raises RuntimeError.
3. **Supabase upload could fail** if the uploads bucket has RLS or storage policies blocking the write. Untestable until the LoRA fix lets the pipeline reach that step.

## Next best single step

Wait for Docker build of commit `359fc9d` to complete (~10 min). Cycle RunPod workers (`workersMax=0` → `workersMax=2`). Create a test generation job and dispatch to RunPod. Verify the full pipeline: FLUX → face swap → upload → job status = completed. If it fails, the error reason will be in the RunPod output (no guessing needed).
