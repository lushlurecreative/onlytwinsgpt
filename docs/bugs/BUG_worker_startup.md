# Bug: Worker 2-step pipeline — FLUX + FaceFusion crashes on cold start

## Expected behavior

`generate_swap.py` runs FLUX scene generation (with LoRA), saves base image, then runs FaceFusion face swap using training photo as source face. Output is an identity-preserving image uploaded to Supabase.

## Actual behavior

Worker pulls new Docker image (confirmed: different worker ID `3x1fkylcuay8uk`), starts the job, runs for 32 seconds, then sets job status to `failed` with no output_path. RunPod reports COMPLETED (bug: `app.py` handler masks internal failures). No worker logs visible from app side.

## Root cause (identified 2026-04-12)

**PyTorch CUDA allocator cache** — `generate_flux.py` loaded the FLUX pipeline (~16GB VRAM) but never freed it. When `generate()` returned, Python deallocated the objects, but PyTorch's CUDA allocator cached the freed GPU memory instead of returning it to CUDA. FaceFusion (ONNX Runtime) then tried to allocate via CUDA directly and failed — PyTorch was holding all the memory.

Three contributing factors:
1. No `torch.cuda.empty_cache()` after FLUX inference (PRIMARY)
2. `warmup()` in `app.py` preloaded FaceFusion models (~1.5GB), reducing headroom
3. `generate_swap.py` had a fallback that reloaded FLUX a second time on face-swap failure (guaranteed OOM)

## Fix applied (2026-04-12)

| File | Change |
|------|--------|
| `worker/generate_flux.py` | Wrap FLUX pipeline in try/finally: `del pipe; del transformer; gc.collect(); torch.cuda.empty_cache()` after inference |
| `worker/generate_swap.py` | Belt-and-suspenders `gc.collect(); torch.cuda.empty_cache()` between FLUX and FaceFusion steps. Removed double-FLUX fallback. Added VRAM diagnostic logging. |
| `worker/main.py` | `run_generation_job()` returns `True`/`False` instead of void |
| `worker/app.py` | Handler checks return value — returns `{"error": ...}` when generation fails internally |

## Verification needed

- [ ] Push to main, Docker image built via GitHub Actions
- [ ] Cycle RunPod workers to pull new image
- [ ] Trigger generation job via admin UI
- [ ] Verify: FLUX generates scene → GPU freed → FaceFusion runs face swap → output uploaded → job status = completed
- [ ] Check RunPod logs for `[generate_flux] GPU memory released` and `[generate_swap] GPU after FLUX cleanup: XX.X GB free`

## Status: FIX APPLIED — awaiting deploy and verification (2026-04-12)
