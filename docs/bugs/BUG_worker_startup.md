# Bug: Face Swap / Identity Quality

## Expected behavior

Generated images preserve the subject's identity convincingly — sharp eyes, natural skin, seamless blending, no "pasted on" look. Quality suitable for premium homepage showcase.

## Actual behavior

- Docker build: **FIXED** — all 8 facefusionlib models download, image on Docker Hub.
- Worker runs on RunPod: **WORKING** — jobs execute, return base64 JPEG.
- Face swap quality: **NOT PRODUCTION GRADE** — facefusionlib + inswapper_128 is a black-box 128x128 swap with no face parsing, no dedicated restoration, no identity scoring, no color harmonization.

## Decision: Replace entire stack

After full audit (2026-04-01), the facefusionlib approach was determined to be fundamentally insufficient. A new stack was chosen:

**Homepage Hook (Phase 1A — offline, manual curation):**
- InfiniteYou-FLUX sim_stage1 — identity-preserving generation (works from 1 photo, ICCV 2025)
- ReActor (inswapper_128 via ComfyUI) — refinement when identity drifts
- CodeFormer — face restoration
- ComfyUI — workflow orchestration
- Real-ESRGAN x4plus — upscaling

**Production (Phase 2 — later):**
- Same stack integrated into RunPod workers
- AlphaFace for face swap (pose robustness)
- BiSeNet + Poisson blending for masking
- ArcFace quality scoring + auto-rejection

Full plan: `/.claude/plans/optimized-plotting-pearl.md`

## Confirmed facts

- facefusionlib 1.1.3 uses `inswapper_128` — 128x128 resolution, inherently low quality ceiling
- No face parsing (only gaussian blur mask), no dedicated eye/teeth restoration, no color harmonization
- InfiniteYou-FLUX confirmed strongest available identity-preserving generation model
- InfiniteYou has official ComfyUI nodes (`bytedance/ComfyUI_InfiniteYou`)
- InfiniteYou works from a single source photo (no training set needed for homepage)
- ReActor is the most mature ComfyUI face swap node (AlphaFace has no ComfyUI integration)

## Things already tried

| Attempt | Result |
|---|---|
| facefusionlib param tuning (detector_score, mask_blur) | Quality still fundamentally limited by 128x128 swap |
| RunPod A40 pod setup with ComfyUI + InfiniteYou | Partial — hit 20GB volume disk limit, FLUX UNET downloaded, other models blocked |
| `huggingface_hub` downloads on RunPod | Fills container disk unless `HF_HOME=/workspace/hf_cache` is set |

## Next single step

Terminate current RunPod pod. Create new pod with **200GB volume disk**. Re-run setup (ComfyUI + InfiniteYou + all models). Generate first test image. Instructions in `worker/workflows/STEP_BY_STEP.md`.

## Status: STACK REPLACED — NEW SETUP BLOCKED ON POD DISK SIZE
