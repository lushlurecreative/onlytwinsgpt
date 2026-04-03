#!/bin/bash
# =============================================================================
# OnlyTwins ComfyUI Pod Setup — Phase 1A Homepage Hook
# =============================================================================
# Run this on a fresh RunPod interactive pod (A40 48GB recommended).
# It installs ComfyUI, all required custom nodes, and downloads all models.
#
# Usage:
#   chmod +x setup_comfyui_pod.sh
#   ./setup_comfyui_pod.sh
#
# After setup, start ComfyUI with:
#   cd /workspace/ComfyUI && python main.py --listen 0.0.0.0 --port 8188
#
# Then open the pod's port 8188 in your browser.
# =============================================================================

set -euo pipefail

WORKSPACE="/workspace"
COMFYUI_DIR="$WORKSPACE/ComfyUI"
HF_TOKEN="${HF_TOKEN:-}"

echo "============================================="
echo "OnlyTwins ComfyUI Setup — Phase 1A"
echo "============================================="
echo ""

# ---------------------------------------------------------------------------
# 0. Pre-checks
# ---------------------------------------------------------------------------
echo "[0/7] Pre-checks..."
if [ -z "$HF_TOKEN" ]; then
    echo ""
    echo "  ERROR: HF_TOKEN not set."
    echo "  FLUX.1-dev is a gated model — you need a HuggingFace token."
    echo ""
    echo "  1. Go to https://huggingface.co/settings/tokens"
    echo "  2. Create a token with 'read' access"
    echo "  3. Accept the FLUX.1-dev license at https://huggingface.co/black-forest-labs/FLUX.1-dev"
    echo "  4. Run:  export HF_TOKEN=hf_your_token_here"
    echo "  5. Then re-run this script."
    echo ""
    exit 1
fi
echo "  HF_TOKEN: set"

echo ""
echo "[0/7] Checking GPU..."
if command -v nvidia-smi &>/dev/null; then
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
else
    echo "WARNING: nvidia-smi not found. Make sure you rented a GPU pod."
fi
echo ""

# ---------------------------------------------------------------------------
# 1. System deps + PyTorch upgrade
# ---------------------------------------------------------------------------
echo "[1/7] Installing system dependencies..."
apt-get update -qq && apt-get install -y -qq git wget curl ffmpeg libgl1 libglib2.0-0 >/dev/null 2>&1
echo "  Done."

echo "  Checking PyTorch version..."
TORCH_VERSION=$(python3 -c "import torch; print(torch.__version__)" 2>/dev/null || echo "none")
if [[ "$TORCH_VERSION" == 2.1.* ]] || [[ "$TORCH_VERSION" == 2.0.* ]] || [[ "$TORCH_VERSION" == "none" ]]; then
    echo "  PyTorch $TORCH_VERSION is too old for ComfyUI. Upgrading to 2.4.1+cu118..."
    pip install --force-reinstall torch==2.4.1 torchvision==0.19.1 torchaudio==2.4.1 --index-url https://download.pytorch.org/whl/cu118
    pip install numpy==1.26.4
    echo "  PyTorch upgraded."
else
    echo "  PyTorch $TORCH_VERSION — OK."
fi
echo ""

# ---------------------------------------------------------------------------
# 2. Install ComfyUI
# ---------------------------------------------------------------------------
echo "[2/7] Installing ComfyUI..."
if [ -d "$COMFYUI_DIR" ]; then
    echo "  ComfyUI already exists, pulling latest..."
    cd "$COMFYUI_DIR" && git pull --quiet
else
    cd "$WORKSPACE"
    git clone https://github.com/comfyanonymous/ComfyUI.git
    cd "$COMFYUI_DIR"
fi
pip install -q -r requirements.txt
echo "  Done."
echo ""

# ---------------------------------------------------------------------------
# 3. Install ComfyUI Manager
# ---------------------------------------------------------------------------
echo "[3/7] Installing ComfyUI Manager..."
CUSTOM_NODES="$COMFYUI_DIR/custom_nodes"
mkdir -p "$CUSTOM_NODES"

if [ ! -d "$CUSTOM_NODES/ComfyUI-Manager" ]; then
    cd "$CUSTOM_NODES"
    git clone https://github.com/ltdrdata/ComfyUI-Manager.git
fi
echo "  Done."
echo ""

# ---------------------------------------------------------------------------
# 4. Install custom nodes
# ---------------------------------------------------------------------------
echo "[4/7] Installing custom nodes..."

# InfiniteYou (ByteDance) — identity-preserving generation
if [ ! -d "$CUSTOM_NODES/ComfyUI_InfiniteYou" ]; then
    echo "  Installing ComfyUI_InfiniteYou..."
    cd "$CUSTOM_NODES"
    git clone https://github.com/bytedance/ComfyUI_InfiniteYou.git
    if [ -f ComfyUI_InfiniteYou/requirements.txt ]; then
        pip install -q -r ComfyUI_InfiniteYou/requirements.txt
    fi
fi

# NOTE: ReActor (comfyui-reactor-node) is unavailable — GitHub repo disabled by staff.
# If face refinement is needed, use CodeFormer or GFPGAN instead.

# Install insightface and onnxruntime-gpu (needed by InfiniteYou)
pip install -q insightface>=0.7.3 onnxruntime-gpu==1.17.1

echo "  Done."
echo ""

# ---------------------------------------------------------------------------
# 5. Download models
# ---------------------------------------------------------------------------
echo "[5/7] Downloading models..."

MODELS_DIR="$COMFYUI_DIR/models"
mkdir -p "$MODELS_DIR/diffusion_models"
mkdir -p "$MODELS_DIR/unet"
mkdir -p "$MODELS_DIR/clip"
mkdir -p "$MODELS_DIR/vae"
mkdir -p "$MODELS_DIR/insightface"
mkdir -p "$MODELS_DIR/insightface/models"
mkdir -p "$MODELS_DIR/facerestore_models"
mkdir -p "$MODELS_DIR/upscale_models"

# --- FLUX.1-dev for ComfyUI (individual model files, not full diffusers repo) ---
# ComfyUI uses: UNETLoader, DualCLIPLoader, VAELoader — each needs separate files.
# We download the FP8 quantized versions to fit in A40 48GB VRAM alongside InfiniteYou.
pip install -q huggingface_hub

echo "  Downloading FLUX.1-dev UNET (fp8, ~12GB)..."
if [ ! -f "$MODELS_DIR/diffusion_models/flux1-dev.safetensors" ]; then
    python3 -c "
from huggingface_hub import hf_hub_download
import shutil
# FP8 quantized FLUX dev — fits ComfyUI UNETLoader directly
path = hf_hub_download('Comfy-Org/flux1-dev', 'flux1-dev-fp8.safetensors', token='${HF_TOKEN}' if '${HF_TOKEN}' else None)
shutil.copy(path, '$MODELS_DIR/diffusion_models/flux1-dev.safetensors')
print('  FLUX UNET downloaded.')
" 2>/dev/null || {
    echo "  Trying alternative FLUX source..."
    python3 -c "
from huggingface_hub import hf_hub_download
import shutil
path = hf_hub_download('black-forest-labs/FLUX.1-dev', 'flux1-dev.safetensors', token='${HF_TOKEN}' if '${HF_TOKEN}' else None)
shutil.copy(path, '$MODELS_DIR/diffusion_models/flux1-dev.safetensors')
print('  FLUX UNET downloaded (full precision).')
"
}
fi

echo "  Downloading FLUX CLIP models..."
# T5-XXL FP8 for FLUX text encoding
if [ ! -f "$MODELS_DIR/clip/t5xxl_fp8_e4m3fn.safetensors" ]; then
    python3 -c "
from huggingface_hub import hf_hub_download
import shutil
path = hf_hub_download('comfyanonymous/flux_text_encoders', 't5xxl_fp8_e4m3fn.safetensors')
shutil.copy(path, '$MODELS_DIR/clip/t5xxl_fp8_e4m3fn.safetensors')
print('  T5-XXL FP8 downloaded.')
"
fi
# CLIP-L for FLUX
if [ ! -f "$MODELS_DIR/clip/clip_l.safetensors" ]; then
    python3 -c "
from huggingface_hub import hf_hub_download
import shutil
path = hf_hub_download('comfyanonymous/flux_text_encoders', 'clip_l.safetensors')
shutil.copy(path, '$MODELS_DIR/clip/clip_l.safetensors')
print('  CLIP-L downloaded.')
"
fi

echo "  Downloading FLUX VAE..."
if [ ! -f "$MODELS_DIR/vae/ae.safetensors" ]; then
    python3 -c "
from huggingface_hub import hf_hub_download
import shutil
path = hf_hub_download('black-forest-labs/FLUX.1-dev', 'ae.safetensors', token='${HF_TOKEN}' if '${HF_TOKEN}' else None)
shutil.copy(path, '$MODELS_DIR/vae/ae.safetensors')
print('  FLUX VAE downloaded.')
"
fi

# --- InfiniteYou models (sim_stage1 + aes_stage2) ---
# InfiniteYou nodes expect models in: models/infinite_you/
echo "  Downloading InfiniteYou models..."
pip install -q huggingface_hub
INFYOU_DIR="$MODELS_DIR/infinite_you"
mkdir -p "$INFYOU_DIR"
python3 -c "
from huggingface_hub import snapshot_download
snapshot_download(
    'ByteDance/InfiniteYou',
    local_dir='$INFYOU_DIR',
    allow_patterns=['infu_flux_v1.0/**'],
    ignore_patterns=['*.md', '*.txt', '.gitattributes']
)
# Move files from infu_flux_v1.0/ up one level so nodes can find them
import os, shutil
src = '$INFYOU_DIR/infu_flux_v1.0'
if os.path.isdir(src):
    for item in os.listdir(src):
        s = os.path.join(src, item)
        d = os.path.join('$INFYOU_DIR', item)
        if os.path.isdir(s):
            if os.path.exists(d):
                shutil.rmtree(d)
            shutil.copytree(s, d)
        else:
            shutil.copy2(s, d)
    shutil.rmtree(src)
print('  InfiniteYou models downloaded.')
print('  Variants available:')
for root, dirs, files in os.walk('$INFYOU_DIR'):
    for f in files:
        if f.endswith(('.bin', '.safetensors')):
            print(f'    {os.path.relpath(os.path.join(root, f), \"$INFYOU_DIR\")}')
"

# --- InsightFace antelopev2 (face detection + embedding) ---
echo "  Downloading InsightFace antelopev2..."
ANTELOPE_DIR="$MODELS_DIR/insightface/models/antelopev2"
mkdir -p "$ANTELOPE_DIR"
if [ ! -f "$ANTELOPE_DIR/1k3d68.onnx" ]; then
    # antelopev2 models from InsightFace
    python3 -c "
from huggingface_hub import hf_hub_download
import os, zipfile, shutil
# Download the antelopev2 model pack
path = hf_hub_download('MonsterMMORPG/tools', 'antelopev2.zip', repo_type='model')
# Extract to the right location
with zipfile.ZipFile(path, 'r') as z:
    z.extractall('$MODELS_DIR/insightface/models/')
print('  antelopev2 downloaded.')
" 2>/dev/null || echo "  NOTE: antelopev2 auto-download may need manual setup. Will try alternative..."
fi

# --- CodeFormer ---
echo "  Downloading CodeFormer..."
CODEFORMER_PATH="$MODELS_DIR/facerestore_models/codeformer-v0.1.0.pth"
if [ ! -f "$CODEFORMER_PATH" ]; then
    wget -q -O "$CODEFORMER_PATH" \
        "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth" \
        2>/dev/null || echo "  NOTE: CodeFormer download may need alternative URL."
fi

# --- GFPGAN v1.4 (fallback face restoration) ---
echo "  Downloading GFPGAN v1.4..."
GFPGAN_PATH="$MODELS_DIR/facerestore_models/GFPGANv1.4.pth"
if [ ! -f "$GFPGAN_PATH" ]; then
    wget -q -O "$GFPGAN_PATH" \
        "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/GFPGANv1.4.pth" \
        2>/dev/null || echo "  NOTE: GFPGAN download may need alternative URL."
fi

# --- Real-ESRGAN x4plus ---
echo "  Downloading Real-ESRGAN x4plus..."
ESRGAN_PATH="$MODELS_DIR/upscale_models/RealESRGAN_x4plus.pth"
if [ ! -f "$ESRGAN_PATH" ]; then
    wget -q -O "$ESRGAN_PATH" \
        "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth" \
        2>/dev/null || echo "  NOTE: Real-ESRGAN download may need alternative URL."
fi

echo "  Done."
echo ""

# ---------------------------------------------------------------------------
# 6. Verify installation
# ---------------------------------------------------------------------------
echo "[6/7] Verifying installation..."
echo ""
echo "  Custom nodes installed:"
ls -1 "$CUSTOM_NODES" | grep -v __pycache__ | sed 's/^/    /'
echo ""
echo "  Models directory:"
find "$MODELS_DIR" -name "*.onnx" -o -name "*.pth" -o -name "*.safetensors" 2>/dev/null | head -20 | sed 's/^/    /'
echo ""

# ---------------------------------------------------------------------------
# 7. Done
# ---------------------------------------------------------------------------
echo "[7/7] Setup complete!"
echo ""
echo "============================================="
echo "NEXT STEPS:"
echo "============================================="
echo ""
echo "1. Start ComfyUI:"
echo "   cd /workspace/ComfyUI && python main.py --listen 0.0.0.0 --port 8188"
echo ""
echo "2. Open in browser:"
echo "   Go to your RunPod pod's port 8188 URL"
echo ""
echo "3. Load the workflow:"
echo "   Drag and drop the workflow JSON into ComfyUI, or build it manually."
echo ""
echo "4. Upload your source photo and start generating!"
echo ""
echo "============================================="
echo "MODEL LOCATIONS (for ComfyUI node config):"
echo "============================================="
echo "  FLUX UNET:        $MODELS_DIR/diffusion_models/flux1-dev.safetensors"
echo "  FLUX T5-XXL:      $MODELS_DIR/clip/t5xxl_fp8_e4m3fn.safetensors"
echo "  FLUX CLIP-L:      $MODELS_DIR/clip/clip_l.safetensors"
echo "  FLUX VAE:         $MODELS_DIR/vae/ae.safetensors"
echo "  InfiniteYou:      $MODELS_DIR/infinite_you/"
echo "    sim_stage1:     sim_stage1/image_proj_model.bin + infusenet_sim_*.safetensors"
echo "    aes_stage2:     aes_stage2/image_proj_model.bin + infusenet_aes_*.safetensors"
echo "  InsightFace:      $MODELS_DIR/insightface/models/antelopev2/"
echo "  CodeFormer:       $MODELS_DIR/facerestore_models/codeformer-v0.1.0.pth"
echo "  GFPGAN:           $MODELS_DIR/facerestore_models/GFPGANv1.4.pth"
echo "  Real-ESRGAN:      $MODELS_DIR/upscale_models/RealESRGAN_x4plus.pth"
echo ""
echo "============================================="
echo "COMFYUI NODE SETTINGS:"
echo "============================================="
echo ""
echo "  UNETLoader:           flux1-dev.safetensors / fp8_e4m3fn_fast"
echo "  DualCLIPLoader:       t5xxl_fp8_e4m3fn.safetensors + clip_l.safetensors / flux"
echo "  VAELoader:            ae.safetensors"
echo "  IDEmbeddingModelLoader: sim_stage1/image_proj_model.bin / 16 tokens / CUDA / 640"
echo "  InfuseNetLoader:      sim_stage1/infusenet_sim_fp8e4m3fn.safetensors"
echo "  InfuseNetApply:       strength=1.0, start=0.0, end=1.0"
echo "  KSampler:             steps=28, cfg=3.5, euler, simple, seed=randomize"
echo "  EmptyLatentImage:     1024x1024"
echo ""
