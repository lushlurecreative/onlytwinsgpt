# Phase 1: CPU-Only Face-Swap Validation

**Goal**: Prove a custom self-hosted Docker worker can build and successfully swap one face end-to-end.

**Status**: Implementation complete (files created, not yet tested)

---

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `requirements-faceswap.txt` | **CREATE** | Minimal, pinned CPU-only dependencies (no FLUX, no GPU ONNX) |
| `Dockerfile.faceswap-minimal` | **CREATE** | Ultra-minimal Ubuntu 22.04 + Python 3.11 + all system deps upfront |
| `test_faceswap_standalone.py` | **CREATE** | Standalone validator (no Supabase, no Flask, no HTTP) |

## Minimal Architecture

```
INPUT:
  user_photo.jpg
  scenario.jpg

PROCESS (test_faceswap_standalone.py):
  1. Load user photo
  2. Load scenario image
  3. Initialize InsightFace (buffalo_l model, CPU)
  4. Detect faces in both images
  5. Swap user's face into scenario
  6. Write output.jpg

OUTPUT:
  output.jpg (face-swapped image)

NO DEPENDENCIES ON:
  - Supabase (skip upload)
  - Flask (skip HTTP server)
  - GPU (CPU only)
  - RunPod (standalone)
  - Homepage flow (isolated test)
```

---

## Build Path (CPU-only)

### Prerequisites
- Docker installed and running
- 2 test images: user.jpg (face) + scenario.jpg (target)

### Step 1: Build Docker image

```bash
cd /Users/shaunosborne/onlytwinsgpt

docker build \
  -f worker/Dockerfile.faceswap-minimal \
  -t onlytwinsgpt-worker-faceswap:cpu-test \
  worker/
```

**Expected**: Build completes in ~3-5 minutes without compilation errors.

**If fails**: Error will be in `pip install` output. First failing package name is the root cause.

---

### Step 2: Run standalone test inside Docker

Create a simple test container that mounts test images and outputs result:

```bash
# Prepare test images (adjust paths as needed)
USER_PHOTO="/path/to/user.jpg"
SCENARIO_PHOTO="/path/to/scenario.jpg"
OUTPUT_DIR="/tmp/faceswap-output"

mkdir -p "$OUTPUT_DIR"

docker run --rm \
  -v "$USER_PHOTO":/tmp/user.jpg \
  -v "$SCENARIO_PHOTO":/tmp/scenario.jpg \
  -v "$OUTPUT_DIR":/tmp/output \
  onlytwinsgpt-worker-faceswap:cpu-test \
  python /app/test_faceswap_standalone.py \
    /tmp/user.jpg \
    /tmp/scenario.jpg \
    /tmp/output/swapped.jpg
```

**Expected output**:
```
============================================================
Face-Swap Standalone Test
============================================================

[1/6] Loading user photo: /tmp/user.jpg
  ✓ Loaded (1080, 1920, 3)
[2/6] Loading scenario image: /tmp/scenario.jpg
  ✓ Loaded (720, 1280, 3)
[3/6] Initializing InsightFace model (inswapper_128.onnx)...
  ✓ Model loaded
[4/6] Initializing FaceAnalysis (buffalo_l)...
  ✓ FaceAnalysis initialized
[5/6] Detecting faces...
  ✓ Found 1 face(s) in user photo
  ✓ Found 1 face(s) in scenario image
[6/6] Swapping faces...
  • Swapping face 1/1...
  ✓ Swap successful: /tmp/output/swapped.jpg (1.23 MB)

============================================================
✓ SUCCESS: Face swap completed
============================================================
```

**If fails at step [1]**: Image path wrong or image format unsupported.
**If fails at step [3]**: InsightFace model download/load failed (network issue or corrupt cache).
**If fails at step [4]**: InsightFace initialization failed (missing system lib).
**If fails at step [5]**: No faces detected (faces too small, poor quality, or wrong angle).
**If fails at step [6]**: Swap failed (incompatible face sizes or corrupted image).

---

### Step 3: Verify output exists and is valid

```bash
ls -lh /tmp/faceswap-output/swapped.jpg
file /tmp/faceswap-output/swapped.jpg
```

**Expected**:
- File exists and is > 100KB
- `file` command returns JPEG

---

## Expected Outcomes (4 Possibilities)

| Scenario | Result | Next Step |
|----------|--------|-----------|
| Build succeeds, inference succeeds | ✓ **BUILD WORKS, INFERENCE WORKS** | Move to Phase 2: HTTP server + RunPod |
| Build succeeds, inference fails | ⚠ **BUILD WORKS, INFERENCE FAILS** | Debug which step fails, fix dependencies |
| Build fails | ✗ **BUILD FAILS** | Examine pip install error, diagnose root cause |
| Build timeout | ✗ **BUILD HANGS** | Likely insightface model download stuck |

---

## Troubleshooting Guide

### Docker build fails: `error: command 'gcc' failed`
- **Cause**: Missing C compiler or build headers
- **Check**: Dockerfile includes `build-essential python3.11-dev` — if error still occurs, a library needs explicit system package
- **Next**: Add to Dockerfile RUN: `apt-get install -y libssl-dev libffi-dev`

### Docker build fails: `wheel not found` or `no matching distribution`
- **Cause**: Package version conflict or wheel not available for platform
- **Fix**: Loosen version pin (remove `==X.Y.Z`) or use different version
- **Example**: `insightface>=0.7.3` becomes `insightface==0.7.2`

### Run fails: `InsightFace not installed`
- **Cause**: pip install silently failed during build
- **Check**: Build log for warnings during `pip install -r requirements-faceswap.txt`
- **Next**: Rebuild with `--no-cache` flag: `docker build --no-cache ...`

### Run fails: `No face detected`
- **Cause**: Test images don't have clear faces or faces are too small
- **Fix**: Use clear headshot photos (1000x1000 px minimum)
- **Test**: Run test images through face detector first: `python -c "import insightface; app = insightface.app.FaceAnalysis(name='buffalo_l'); faces = app.get(cv2.imread('user.jpg')); print(len(faces))"`

### Run fails: `ONNX model not found` or download hangs
- **Cause**: First-time model download taking >5 min or network issue
- **Fix**: Pre-download inside Docker: Add step in Dockerfile:
  ```dockerfile
  RUN python -c "import insightface; insightface.model_zoo.get_model('inswapper_128.onnx')"
  ```

---

## Minimal Dependencies Explanation

**requirements-faceswap.txt** is intentionally small:

```
flask==3.0.0              # HTTP server (for app.py)
requests==2.31.0          # URL download
supabase==2.4.0           # Storage upload
python-dotenv==1.0.0      # .env loading
insightface==0.7.3        # Face swap core
onnxruntime==1.16.3       # ONNX inference (CPU)
opencv-python-headless==4.8.1.78  # Image I/O
numpy==1.24.3             # Arrays
```

**NOT included** (for later phases):
- `torch`, `torchvision` (FLUX training/inference)
- `diffusers`, `transformers` (FLUX)
- `onnxruntime-gpu` (GPU inference — added only after build proven)
- `invisible-watermark` (watermark embedding)
- `peft`, `accelerate` (LoRA training)

**Rationale**: CPU-only build is a validation milestone. Once build+inference works, add GPU later.

---

## Commit

```
daaf422 feat: add minimal CPU-only face-swap validation worker
```

**What's ready**:
- ✓ Files created and committed
- ✓ Dockerfile optimized (all system deps upfront, minimal Python deps)
- ✓ Test script ready (standalone, no external services)
- ✗ Docker build not yet run (no Docker in this environment)
- ✗ Face swap not yet validated (depends on Docker build)

---

## Next (After Validation)

If validation succeeds:
1. Add HTTP server wrapper (app.py already exists, reuse)
2. Switch to Dockerfile.serverless (with GPU ONNX)
3. Push to Docker Hub
4. Deploy to RunPod
5. Connect to NextJS homepage flow

If validation fails:
1. Debug from build logs
2. Adjust Dockerfile/requirements
3. Retry

---

## Cost Estimate (CPU)

- **Build time**: 3-5 minutes (first time; ~30s after cached)
- **Inference time per swap**: 30-60 seconds (CPU, single face)
- **Memory**: ~2GB RAM during inference

**Note**: CPU is too slow for real homepage preview. Use for validation only.

