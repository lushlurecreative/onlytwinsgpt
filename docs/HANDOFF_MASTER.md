# Handoff Master

Last updated: 2026-04-03

## Project goal

OnlyTwins is a production AI content generation SaaS. Users subscribe via Stripe, upload photos, receive AI-generated content. Target: $80k–$150k/month. Currently executing the Homepage Hook initiative — generating identity-preserving images using InfiniteYou-FLUX on RunPod, wired into the live site at onlytwins.dev.

## What is COMPLETE (do not redo)

### RunPod Pod Environment ✅

- **Pod**: `uezkz34ux59drh` (RTX A6000 48GB, 200GB volume, US datacenter)
- **ComfyUI URL**: `https://uezkz34ux59drh-8188.proxy.runpod.net/`
- **ComfyUI**: v0.18.1, PyTorch 2.4.1+cu118
- **Models**: FLUX fp8, T5-XXL fp8, CLIP-L, FLUX VAE, InfiniteYou sim_stage1 + aes_stage2, InsightFace antelopev2, CodeFormer, GFPGAN, Real-ESRGAN
- **Custom nodes**: ComfyUI-Manager, ComfyUI_InfiniteYou (ByteDance), ComfyUI-Impact-Pack (installed end of session, ComfyUI NOT yet restarted to load it)
- Setup script: `worker/setup_comfyui_pod.sh`

### Programmatic ComfyUI Generation ✅

- `worker/trigger_comfyui.py` — standalone CLI that auto-discovers node inputs, uploads image, queues workflow, polls, downloads output
- Confirmed working: 1 successful generation in 33s (28 steps) and 24s (20 steps)

### Live Site Integration ✅ (deployed, but quality is broken)

- `lib/comfyui.ts` — TypeScript ComfyUI API client (upload, build prompt, queue, poll, download)
- `app/api/preview/infiniteyou/route.ts` — API endpoint called by homepage
- `app/HomeClient.tsx` — calls InfiniteYou instead of old face-swap, animated progress bar
- `COMFYUI_SERVER_URL` env var set in Vercel
- Unique filenames per upload to prevent overwrites

### Platform (not this session's focus) ✅

- Stripe checkout → webhook → profile + subscription provisioning
- Thank-you page polling, entitlement resolution, admin routing
- RunPod Serverless endpoint `bd5p04vpmrob2u`

## Active work

### 2-Step Pipeline: FLUX + FaceFusion (replacing InfiniteYou)

InfiniteYou identity approach abandoned — unreliable identity, plastic output. New pipeline:

1. **Step 1**: FLUX generates body/pose/scene with a generic person (no identity)
2. **Step 2**: FaceFusion (inswapper_128) swaps user's uploaded face onto the scene → pixel-level identity match

**Files created/modified:**
- `worker/generate_swap.py` — new 2-step pipeline module
- `worker/test_generate_swap.py` — standalone test script
- `app/api/preview/generate-swap/route.ts` — new API endpoint (replaces `/api/preview/infiniteyou`)
- `worker/app.py` — added `generate_swap` job type to RunPod serverless handler
- `worker/handler.py` — added `generate_swap` job type to RunPod serverless handler
- `worker/main.py` — generation jobs now use generate+swap (with fallback to old FLUX-only)
- `app/HomeClient.tsx` — homepage now calls `/api/preview/generate-swap`

**Status: TESTED END-TO-END — pipeline works.**

**Test results (2026-04-02):**
- FLUX scene generation (20 steps, no identity): 21.6s on A6000
- FaceFusion face swap: 4.3s warm, ~30s cold
- Total: ~26s warm, ~55s cold
- Identity: Face swap clearly transfers source facial features (eyes, jawline, brow)
- Hair: Stays from generated scene (expected — inswapper swaps face region only)
- Key learning: Prompt MUST match source person's gender. Cross-gender swap fails.

## Changes made this session

1. Created `worker/trigger_comfyui.py` — programmatic ComfyUI generation (auto-discovers node inputs)
2. Created `lib/comfyui.ts` — TypeScript ComfyUI client for Vercel API routes
3. Created `app/api/preview/infiniteyou/route.ts` — homepage preview endpoint
4. Modified `app/HomeClient.tsx` — switched from face-swap to InfiniteYou, concurrent progress animation
5. Added `COMFYUI_SERVER_URL` to `.env.local` and Vercel
6. Multiple iterations on step count (28→12→20), prompts, negative prompts, model variants, cfg values
7. Fixed unique filename bug (concurrent uploads overwrote each other's source photos)

## Known facts

- **sim_stage1 + cfg=1.0 preserves identity** — confirmed: re-uploading the source photo and generating produces a matching face (same gender, skin tone, face shape)
- **aes_stage2 does NOT preserve identity** — every test produced a random woman regardless of male source photo
- **Both models use 8 tokens** (not 16 as the original workflow claimed) — 16 tokens causes state_dict size mismatch
- **cfg must be 1.0 for FLUX** — FLUX handles guidance in the text encoder, not KSampler. cfg>1.0 causes shape mismatch errors or over-saturation artifacts
- **RunPod proxy blocks default Python User-Agent** — all HTTP requests need `User-Agent: OnlyTwins/1.0`
- **ComfyUI-Impact-Pack installed but not loaded** — installed via SSH at end of session. ComfyUI must be restarted for the FaceRestoreWithModel node to become available. CodeFormer model is already on disk.
- **ImageSharpen node available** — adds <1s, provides mild crispness improvement
- **Real-ESRGAN upscale+downscale** — adds significant detail but costs +25s (48s total), too slow for homepage hook
- **ComfyUI caches node results** — when same inputs are used, intermediate results are cached (explains fast re-runs)

## Open hypotheses

1. CodeFormer face restoration (now installable — Impact-Pack is on disk, needs ComfyUI restart) may fix the plastic skin
2. ComfyUI may be caching face embeddings across requests even with unique filenames — restarting ComfyUI would confirm
3. bf16 model weights instead of fp8 might produce higher quality — both on disk, bf16 needs ~43GB VRAM (tight on A6000)

## Do not repeat

- Do not use `aes_stage2` for identity-preserving generation — does not preserve identity
- Do not set `cfg` > 1.0 with FLUX — causes shape mismatch or artifacts
- Do not use `image_proj_num_tokens: 16` — both model variants have 8-token weights
- Do not use hardcoded `source_photo.png` filename — concurrent requests overwrite each other
- Do not skip `User-Agent` header when calling RunPod proxy — returns 403
- Do not try ComfyUI Manager API via RunPod proxy — returns 502
- Do not install comfyui-reactor-node — repo disabled by GitHub staff
- Do not use PyTorch 2.1 with latest ComfyUI — needs 2.4+
- Do not use `huggingface_hub` for large downloads — XET backend stalls, use wget
- Do not use RunPod SE datacenters — networking issues
- Do not use RunPod Load Balancer — use Serverless for production billing
- Do not try to improve InfiniteYou identity — abandoned in favor of 2-step pipeline (FLUX + FaceFusion)
- Do not use cross-gender prompts for face swap — male source needs male scene prompt, female source needs female scene prompt
- Do not pass ComfyUI proxy URLs to RunPod workers — workers can't access them. Upload to Supabase and use signed URLs

## Single next objective

**Deploy the 2-step pipeline to production.**

The pipeline is tested and working (FLUX via ComfyUI + FaceFusion via RunPod serverless). Two things needed for production:

1. **Build Docker image with BOTH FLUX + FaceFusion** — current `Dockerfile.production` only has FaceFusion. Needs `diffusers`, `transformers`, `accelerate`, `torch` added. OR keep the 2-service architecture (ComfyUI for generation, RunPod serverless for face swap).

2. **Gender-aware prompting** — the scene prompt MUST match the source person's gender. Cross-gender face swap fails. Options:
   - Use FaceFusion's built-in gender detection on the source face
   - Ask user during onboarding
   - Default to gender-neutral prompt ("a person") and rely on face swap quality

3. **Push frontend changes to main** — homepage already points to `/api/preview/generate-swap`, build passes. Deploy triggers automatically via Vercel.

The 2-service architecture (ComfyUI for step 1, RunPod serverless for step 2) is already working and may be the fastest path to production without rebuilding the Docker image.
