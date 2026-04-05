# Phase 1A Quick Reference

## Pod Setup (one time)

```bash
# SSH into your RunPod A40 48GB pod, then:
export HF_TOKEN=hf_your_token_here
cd /workspace
# Upload setup script (or clone repo)
chmod +x setup_comfyui_pod.sh
./setup_comfyui_pod.sh
```

## Start ComfyUI

```bash
cd /workspace/ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

Open the pod's port 8188 URL in your browser.

## Build the Workflow (node by node)

### Model Loading (left side)
1. **UNETLoader** — model: `flux1-dev.safetensors`, dtype: `fp8_e4m3fn_fast`
2. **DualCLIPLoader** — clip1: `t5xxl_fp8_e4m3fn.safetensors`, clip2: `clip_l.safetensors`, type: `flux`
3. **VAELoader** — vae: `ae.safetensors`

### Identity (bottom)
4. **LoadImage** — upload your source photo here
5. **IDEmbeddingModelLoader** — model: `sim_stage1/image_proj_model.bin`, tokens: `16`, provider: `CUDA`, det_size: `640`
6. **ExtractIDEmbedding** — connect: face_detector/arcface/image_proj from node 5, image from node 4

### Prompt (middle)
7. **CLIPTextEncodeFlux** — connect CLIP from node 2. Write your scene prompt here. Guidance: `3.5`
8. **CLIPTextEncode** — connect CLIP from node 2. Negative: `blurry, deformed, ugly, bad anatomy, bad eyes, crossed eyes, disfigured`

### Control + Apply
9. **EmptyImage** — width: `864`, height: `1152`, batch: `1`, color: `0` (black)
10. **InfuseNetLoader** — model: `sim_stage1/infusenet_sim_fp8e4m3fn.safetensors`
11. **InfuseNetApply** — connect:
    - positive ← node 7 (scene prompt conditioning)
    - id_embedding ← node 6 (identity conditioning)
    - control_net ← node 10 (InfuseNet)
    - image ← node 9 (empty control image)
    - negative ← node 8 (negative prompt)
    - vae ← node 3 (VAE)
    - strength: `1.0`, start: `0.0`, end: `1.0`

### Generation + Output
12. **EmptyLatentImage** — width: `1024`, height: `1024`, batch: `1`
13. **KSampler** — connect:
    - model ← node 1 (FLUX UNET)
    - positive ← node 11 output positive
    - negative ← node 11 output negative
    - latent_image ← node 12
    - seed: `randomize`, steps: `28`, cfg: `3.5`, sampler: `euler`, scheduler: `simple`
14. **VAEDecode** — connect: samples ← node 13, vae ← node 3
15. **SaveImage** — connect: images ← node 14. Prefix: `onlytwins_hook`

## Generate

1. Upload source photo to the LoadImage node
2. Write scene prompt in CLIPTextEncodeFlux
3. Click **Queue Prompt**
4. Check output — change seed and re-queue for variants
5. Generate 15-20 per scene, pick the best

## Scene Prompts That Work

```
professional portrait photo at a tropical beach, golden hour, ocean background, natural skin, 85mm lens, shallow depth of field

lifestyle photo at a modern coffee shop, natural window light, warm tones, candid, 50mm lens

editorial fashion photo on a city street at night, neon lights, cinematic lighting, confident pose

fitness photo at a modern gym, bright even lighting, athletic wear, clean background

casual lifestyle photo at home, warm natural light, relaxed, cozy setting

luxury portrait in a hotel lobby, soft ambient lighting, elegant outfit, marble background

outdoor adventure photo, mountain landscape, golden hour, natural wind in hair

poolside portrait, bright midday sun, sunglasses pushed up, tropical plants background
```

Do NOT put identity descriptions in the prompt. InfiniteYou handles identity from the source photo.

## If Likeness Drifts

Options when identity drifts in a good scene:
1. **Increase InfuseNetApply strength** to 1.2–1.5
2. **Add CodeFormer** node after VAEDecode for face restoration
3. **Generate more variants** — 15-20 per scene, cherry-pick strongest identity matches

> ReActor is unavailable (GitHub repo disabled by staff). InfiniteYou sim_stage1 alone should produce strong identity preservation.

## Source Photo Checklist

- [ ] Frontal to slight 3/4 turn (0-15 degrees)
- [ ] Even, diffused lighting, no harsh face shadows
- [ ] Eyes are tack-sharp (sharpest part of image)
- [ ] Face fills 50%+ of frame, 1024px+ on face
- [ ] Neutral to slight natural smile
- [ ] No beauty mode, no heavy filters
- [ ] No sunglasses, no face mask, no hat on forehead
- [ ] PNG or JPEG 95%+ quality
