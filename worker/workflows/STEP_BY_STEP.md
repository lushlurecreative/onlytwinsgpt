# Phase 1A — Exact Step-by-Step Instructions

## Prerequisites

You need two things before starting:

1. **RunPod account** (you have this)
2. **HuggingFace token** — FLUX.1-dev is a gated model, you need a free token to download it

---

## STEP 1: Get a HuggingFace Token

1. Go to https://huggingface.co/settings/tokens
2. If you don't have an account, create one (free)
3. Click **"Create new token"**
4. Name it anything (e.g., "onlytwins")
5. Set type to **"Read"**
6. Click **"Create token"**
7. Copy the token — it starts with `hf_`
8. Save it somewhere (Notes app, password manager, whatever)

Now accept the FLUX model license:

9. Go to https://huggingface.co/black-forest-labs/FLUX.1-dev
10. You'll see a license agreement — click **"Agree and access repository"**
11. Done — you can now download FLUX

---

## STEP 2: Rent a GPU Pod on RunPod

1. Go to https://www.runpod.io/console/pods
2. Click **"+ GPU Pod"** (or "Deploy" — whatever the button says)
3. Pick a GPU:
   - **Best choice: NVIDIA A40 48GB** — InfiniteYou needs ~43GB VRAM in full precision
   - **Also works: A100 40GB or A100 80GB** — A100 40GB works in FP8 mode (~24GB)
   - **Does NOT work: RTX 4090 24GB** — too little VRAM for BF16 mode, tight for FP8
4. For the template/image, pick: **"RunPod Pytorch 2.1"** or **"ComfyUI"** if available
   - If there's a "ComfyUI" template, pick that — it saves setup time
   - If not, any PyTorch template with CUDA works fine
5. Set disk size to **100 GB** minimum (models are large)
6. Set volume size to **100 GB** (persistent storage survives pod restarts)
7. Click **"Deploy"** or **"Create"**
8. Wait for the pod to start (1-3 minutes)

---

## STEP 3: Connect to the Pod

1. In RunPod console, find your running pod
2. Click **"Connect"**
3. You'll see two options:
   - **"Connect to Jupyter Lab"** — opens a browser-based interface with a terminal
   - **"SSH"** or **"Web Terminal"** — opens a terminal directly
4. Click **"Connect to Jupyter Lab"** (easiest)
5. Once Jupyter opens, click **"Terminal"** in the launcher (bottom left area, or File → New → Terminal)
6. You now have a terminal on the GPU machine

---

## STEP 4: Upload the Setup Script to the Pod

**Option A — If you can copy/paste into the terminal:**

In the Jupyter terminal, type exactly:

```bash
cd /workspace
```

Then paste the content of the setup script. But that's messy. Easier:

**Option B — Download from your GitHub repo:**

If your repo is public or you have access:

```bash
cd /workspace
git clone https://github.com/YOUR_USERNAME/onlytwinsgpt.git
cp onlytwinsgpt/worker/setup_comfyui_pod.sh .
chmod +x setup_comfyui_pod.sh
```

Replace `YOUR_USERNAME` with your actual GitHub username.

**Option C — Upload via Jupyter:**

1. In Jupyter Lab, click the **upload arrow icon** (top of the file browser on the left)
2. Navigate to and select `worker/setup_comfyui_pod.sh` from your local machine
3. It uploads to `/workspace/`
4. In the terminal, run:

```bash
cd /workspace
chmod +x setup_comfyui_pod.sh
```

---

## STEP 5: Run the Setup Script

In the terminal, type:

```bash
export HF_TOKEN=hf_paste_your_token_here
./setup_comfyui_pod.sh
```

Replace `hf_paste_your_token_here` with the actual token you copied in Step 1.

**This will take 15-30 minutes.** It downloads ~20GB of AI models. You'll see progress output. Let it finish completely — don't close the tab.

When it's done, you'll see:

```
[7/7] Setup complete!

NEXT STEPS:
...
```

---

## STEP 6: Start ComfyUI

In the same terminal, type:

```bash
cd /workspace/ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

You'll see output like:

```
Starting server
To see the GUI go to: http://0.0.0.0:8188
```

**Leave this terminal running.** Don't close it.

---

## STEP 7: Open ComfyUI in Your Browser

1. Go back to the RunPod console (https://www.runpod.io/console/pods)
2. Find your pod
3. Click **"Connect"**
4. Look for **"Connect to Port 8188"** or a "HTTP Service" button
   - Some RunPod templates show this as a direct link
   - If you don't see port 8188, click **"TCP Port Mappings"** and add port 8188
5. Click the port 8188 link
6. ComfyUI opens in your browser — you'll see a node editor with a default workflow

---

## STEP 8: Build the InfiniteYou Workflow

Clear the default workflow: right-click the canvas → **"Clear"** (or Ctrl+A then Delete).

Now add nodes one by one. To add a node: **right-click the canvas → "Add Node"** and search.

### Row 1: Model Loading

**Node A — UNETLoader:**
1. Right-click canvas → Add Node → search "UNETLoader"
2. In the node, set:
   - **unet_name:** `flux1-dev.safetensors`
   - **weight_dtype:** `fp8_e4m3fn_fast`

**Node B — DualCLIPLoader:**
1. Right-click → Add Node → search "DualCLIPLoader"
2. Set:
   - **clip_name1:** `t5xxl_fp8_e4m3fn.safetensors`
   - **clip_name2:** `clip_l.safetensors`
   - **type:** `flux`

**Node C — VAELoader:**
1. Right-click → Add Node → search "VAELoader"
2. Set:
   - **vae_name:** `ae.safetensors`

### Row 2: Identity

**Node D — LoadImage (your source photo):**
1. Right-click → Add Node → search "LoadImage"
2. Click **"choose file to upload"** in the node
3. Upload your source photo (the one following the specs — frontal, sharp eyes, even lighting)
4. Title this node "SOURCE PHOTO" (double-click the title to rename)

**Node E — IDEmbeddingModelLoader:**
1. Right-click → Add Node → search "IDEmbeddingModelLoader"
   - If it doesn't appear, the InfiniteYou nodes aren't installed. Go back to the terminal and check for errors.
2. Set:
   - **image_proj_model_name:** `sim_stage1/image_proj_model.bin`
   - **image_proj_num_tokens:** `16`
   - **face_analysis_provider:** `CUDA`
   - **face_analysis_det_size:** `640`

**Node F — ExtractIDEmbedding:**
1. Right-click → Add Node → search "ExtractIDEmbedding"
2. Connect (drag from output dot to input dot):
   - Node E **FACE_DETECTOR** output → Node F **face_detector** input
   - Node E **ARCFACE_MODEL** output → Node F **arcface_model** input
   - Node E **IMAGE_PROJ_MODEL** output → Node F **image_proj_model** input
   - Node D **IMAGE** output → Node F **image** input

### Row 3: Prompts

**Node G — CLIPTextEncodeFlux (positive prompt):**
1. Right-click → Add Node → search "CLIPTextEncodeFlux"
2. Connect: Node B **CLIP** output → Node G **clip** input
3. In the text box, type your scene prompt, for example:
   ```
   professional portrait photo at a tropical beach, golden hour, ocean background, natural skin, 85mm lens, shallow depth of field, photorealistic
   ```
4. Set **guidance** to `3.5`

**Node H — CLIPTextEncode (negative prompt):**
1. Right-click → Add Node → search "CLIPTextEncode" (NOT CLIPTextEncodeFlux)
2. Connect: Node B **CLIP** output → Node H **clip** input
3. In the text box type:
   ```
   blurry, deformed, ugly, bad anatomy, bad eyes, crossed eyes, disfigured, poorly drawn face, cartoon, anime, drawing, painting
   ```

### Row 4: Control + InfuseNet

**Node I — EmptyImage:**
1. Right-click → Add Node → search "EmptyImage"
2. Set: width `864`, height `1152`, batch_size `1`, color `0`

**Node J — InfuseNetLoader:**
1. Right-click → Add Node → search "InfuseNetLoader"
2. Set:
   - **controlnet_name:** `sim_stage1/infusenet_sim_fp8e4m3fn.safetensors`
   - (Use `infusenet_sim_bf16.safetensors` if you have A40 48GB and want max quality)

**Node K — InfuseNetApply:**
1. Right-click → Add Node → search "InfuseNetApply"
2. Connect:
   - Node G **CONDITIONING** output → Node K **positive** input
   - Node F **CONDITIONING** output → Node K **id_embedding** input
   - Node J **CONTROL_NET** output → Node K **control_net** input
   - Node I **IMAGE** output → Node K **image** input
   - Node H **CONDITIONING** output → Node K **negative** input
   - Node C **VAE** output → Node K **vae** input
3. Set: strength `1.0`, start_percent `0.0`, end_percent `1.0`

### Row 5: Generation + Output

**Node L — EmptyLatentImage:**
1. Right-click → Add Node → search "EmptyLatentImage"
2. Set: width `1024`, height `1024`, batch_size `1`

**Node M — KSampler:**
1. Right-click → Add Node → search "KSampler"
2. Connect:
   - Node A **MODEL** output → Node M **model** input
   - Node K **positive** output → Node M **positive** input
   - Node K **negative** output → Node M **negative** input
   - Node L **LATENT** output → Node M **latent_image** input
3. Set:
   - **seed:** any number (or leave random)
   - **control_after_generate:** `randomize` (this changes the seed each time you hit Queue)
   - **steps:** `28`
   - **cfg:** `3.5`
   - **sampler_name:** `euler`
   - **scheduler:** `simple`

**Node N — VAEDecode:**
1. Right-click → Add Node → search "VAEDecode"
2. Connect:
   - Node M **LATENT** output → Node N **samples** input
   - Node C **VAE** output → Node N **vae** input

**Node O — SaveImage:**
1. Right-click → Add Node → search "SaveImage"
2. Connect:
   - Node N **IMAGE** output → Node O **images** input
3. Set filename_prefix to `onlytwins_hook`

---

## STEP 9: Generate Your First Image

1. Click **"Queue Prompt"** (button at the bottom right of ComfyUI, or press Ctrl+Enter)
2. Watch the progress bar on each node — they'll light up green as they execute
3. **First run takes 1-3 minutes** (models loading into VRAM)
4. The output appears in the SaveImage node and in `ComfyUI/output/` folder
5. Look at it. Does the face look like your source photo?
   - **Yes** → You have your first homepage candidate
   - **Kinda** → Change the seed (click Queue Prompt again — seed auto-randomizes)
   - **Not at all** → Check your source photo meets the specs, or try strength 1.2-1.5

---

## STEP 10: Generate Variants

1. Click **Queue Prompt** again — seed randomizes, you get a different variant
2. Repeat 15-20 times per scene prompt
3. Change the scene prompt in Node G for different scenes
4. All outputs save to `ComfyUI/output/` with sequential numbering

**Good prompts to try:**

```
lifestyle photo at a modern coffee shop, natural window light, warm tones, candid, 50mm lens

editorial fashion photo on a city street at night, neon lights, cinematic lighting, confident pose

fitness photo at a modern gym, bright even lighting, athletic wear, clean background

casual lifestyle photo at home, warm natural light, relaxed, cozy setting

luxury portrait in a hotel lobby, soft ambient lighting, elegant outfit, marble background

poolside portrait, bright midday sun, tropical plants background, summer vibes
```

---

## STEP 11: If a Good Image Has Slightly Wrong Face

Some outputs will have great scenes but the face drifts slightly. Options:

1. **Re-generate with higher identity strength**: In InfuseNetApply (Node K), try strength 1.2–1.5
2. **Use CodeFormer for face restoration**: Add a FaceRestoreWithCodeFormer node after VAEDecode to clean up face details
3. **Cherry-pick and iterate**: Generate 15-20 variants per scene, pick the ones where identity is strongest

> **Note:** ReActor (comfyui-reactor-node) is unavailable — the GitHub repo has been disabled by staff. InfiniteYou alone should produce strong identity preservation with sim_stage1.

---

## STEP 12: Download Your Best Images

1. In Jupyter Lab, navigate to `/workspace/ComfyUI/output/`
2. Right-click on the images you want → **"Download"**
3. Or zip them:
   ```bash
   cd /workspace/ComfyUI/output
   zip homepage_images.zip onlytwins_hook_*.png
   ```
   Then download the zip from Jupyter file browser

---

## STEP 13: Stop the Pod When Done

**IMPORTANT: RunPod charges by the hour. Stop the pod when you're not using it.**

1. Go to RunPod console → Pods
2. Click the **stop button** on your pod (square icon)
3. Your data is preserved on the volume — you can restart later without re-downloading models

---

## Troubleshooting

**"InfuseNetLoader not found" or "IDEmbeddingModelLoader not found":**
The InfiniteYou nodes didn't install. In the terminal:
```bash
cd /workspace/ComfyUI/custom_nodes/ComfyUI_InfiniteYou
pip install -r requirements.txt
```
Restart ComfyUI.

**"Model not found" errors:**
The model files aren't in the right directory. Check:
```bash
ls /workspace/ComfyUI/models/infinite_you/sim_stage1/
ls /workspace/ComfyUI/models/diffusion_models/
ls /workspace/ComfyUI/models/clip/
ls /workspace/ComfyUI/models/vae/
```

**Out of memory (OOM):**
You need FP8 mode. Make sure:
- UNETLoader dtype is `fp8_e4m3fn_fast`
- InfuseNetLoader uses `infusenet_sim_fp8e4m3fn.safetensors` (not bf16)
- CLIP uses `t5xxl_fp8_e4m3fn.safetensors`

**Image looks nothing like source photo:**
- Check source photo meets the specs (frontal, sharp eyes, even light)
- Try increasing InfuseNetApply strength to 1.2 or 1.5
- Make sure you connected ExtractIDEmbedding output to InfuseNetApply id_embedding input

**ReActor node not found:**
ReActor is unavailable — the GitHub repo has been disabled by staff. Use CodeFormer or higher InfuseNet strength instead.
