# Bug: Worker 2-step pipeline — FLUX + FaceFusion generation pipeline

## Expected behavior

`generate_swap.py` runs FLUX scene generation (with LoRA for identity hints), saves base image, frees GPU memory, runs FaceFusion face swap using training photo as source face, uploads identity-preserving image to Supabase, marks job completed.

## Actual behavior

Three bugs fixed, one remaining:

1. **FIXED (c1c7089):** FLUX held ~16GB VRAM after inference. PyTorch CUDA cache blocked FaceFusion. Job crashed at 32s.
2. **FIXED (b8ebc17):** `app.py` returned `{"status": "completed"}` even on internal failure. RunPod showed COMPLETED for failed jobs.
3. **FIXED (359fc9d):** `importlib.reload(main_mod)` caused diffusers to auto-name adapter `default_0` but `set_adapters()` referenced `default`. Error: `ValueError: Adapter name(s) {'default'} not in the list of present adapters: {'default_0'}`.
4. **PENDING:** Commit `359fc9d` pushed but Docker image not yet built/tested. Pipeline should work end-to-end once deployed.

## Confirmed facts

- GPU memory cleanup works: FLUX runs 28-step inference then `del pipe; gc.collect(); torch.cuda.empty_cache()` frees VRAM. Proven by 62s and 221s execution times (was 32s crash).
- Error reporting works: RunPod job output now shows specific failure reason (e.g., `generation_exception: ValueError: Adapter name(s) {'default'}...`).
- `importlib.reload(main_mod)` in `app.py` is the root cause of the adapter naming collision. Fix: explicit `adapter_name="identity"` in `load_lora_weights()`.
- FaceFusion warmup models coexist with FLUX on 24GB GPU (confirmed by old FLUX-only path working at 60s with warmup loaded).

## Things already tried

| Attempt | Result |
|---|---|
| GPU memory cleanup: try/finally + del + empty_cache (`c1c7089`) | FLUX freed, pipeline reached downstream. Job ran 62s instead of 32s crash. |
| Error reporting: return (success, error_reason) tuple (`b8ebc17`) | RunPod output shows exact error. Identified adapter naming bug. |
| LoRA adapter name: explicit `adapter_name="identity"` (`359fc9d`) | Pushed, awaiting Docker build + test. |
| Worker cycling: GraphQL `workersMax=0→2` | Confirmed new workers pull new image (different worker IDs). |
| 3 test jobs dispatched directly to RunPod via API | All ran on new workers. Error messages surfaced correctly. |

## Next single step

Build Docker image from `359fc9d`, cycle RunPod workers, dispatch test generation job. Check RunPod status endpoint for COMPLETED + verify `output_path` set in `generation_jobs` table + verify image exists in Supabase uploads bucket.

## Status: FIX DEPLOYED — awaiting Docker build and final verification test (2026-04-12)
