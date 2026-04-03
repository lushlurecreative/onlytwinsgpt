# Bug: InfiniteYou output quality unacceptable

## Status: SUPERSEDED — replaced by 2-step pipeline (FLUX + FaceFusion)

InfiniteYou identity approach abandoned. New pipeline: FLUX generates generic scene, FaceFusion swaps source face for pixel-level identity. See `worker/generate_swap.py` and `app/api/preview/generate-swap/route.ts`.

## Previous status: ACTIVE — blocking homepage hook launch

## Expected behavior

Homepage preview generates a photorealistic image of the uploaded person in a scene. The output should:
1. Clearly look like the same person who uploaded the photo (gender, skin tone, face shape, features)
2. Look like a real photograph, not AI-generated (natural skin texture, no plastic/smooth look)

## Actual behavior

1. **Identity not preserved**: output frequently shows a completely different person (e.g., male source → female output). Identity is inconsistent across requests.
2. **Plastic/fake quality**: skin looks airbrushed/CGI, lacks pores, film grain, and natural imperfections. Users immediately identify it as fake.

## Reproduction

1. Go to onlytwins.dev
2. Upload 3 photos of yourself
3. Wait for preview generation (~24s)
4. Result: generated face does not match uploaded person, and looks plastic

## Affected files

- `lib/comfyui.ts` — prompt builder, model selection, parameters
- `app/api/preview/infiniteyou/route.ts` — API endpoint
- `app/HomeClient.tsx` — frontend integration

## Confirmed facts

- **sim_stage1 + cfg=1.0 CAN preserve identity** — verified locally by re-uploading source photo and generating. Output matched source (same gender, skin tone, face shape)
- **aes_stage2 does NOT preserve identity** — tested, always generates wrong person
- **Both models use 8 tokens** — 16 causes state_dict error
- **cfg must be 1.0** for FLUX (guidance is in CLIPTextEncodeFlux, not KSampler)
- **ComfyUI-Impact-Pack installed via SSH** — but ComfyUI has NOT been restarted, so FaceRestoreWithModel node is not yet available. CodeFormer/GFPGAN models are on disk.
- **ImageSharpen helps marginally** — not enough to fix the plastic look
- **Real-ESRGAN upscale+downscale improves detail** but adds +25s (too slow for homepage)
- **ComfyUI caches intermediate node outputs** — may cause identity to "stick" from a previous request

## Things already tried

| Attempt | Result |
|---------|--------|
| sim_stage1, 28 steps, cfg=1.0 | Identity preserved, but still somewhat plastic |
| sim_stage1, 12 steps, cfg=1.0 | Very plastic, identity weak |
| sim_stage1, 20 steps, cfg=1.0 | Better quality, identity present when source is correct |
| aes_stage2, 8 tokens, cfg=1.0 | Identity NOT preserved at all (wrong person) |
| aes_stage2, 16 tokens | state_dict size mismatch error |
| cfg=3.5 with direct negative to KSampler | Severe color artifacts, identity still wrong |
| Anti-plastic prompts ("real skin texture with pores, film grain") | Marginal improvement |
| Anti-plastic negative ("plastic skin, airbrushed, CGI") | Marginal improvement |
| ImageSharpen post-processing | Adds crispness, does not fix plastic look |
| Unique filenames per upload | Fixes overwrite race but identity issue persists on live site |

## Unverified hypotheses

1. ComfyUI node caching may cause ExtractIDEmbedding to reuse a stale face embedding even with unique filenames — restarting ComfyUI would confirm
2. CodeFormer (FaceRestoreWithModel node, now installable) may fix the plastic skin
3. bf16 model weights instead of fp8 may improve quality (needs ~43GB VRAM)

## Next single step

Restart ComfyUI on the pod (loads newly installed Impact-Pack), then add FaceRestoreWithModel (CodeFormer) after VAEDecode in `lib/comfyui.ts` and test both quality and identity.
