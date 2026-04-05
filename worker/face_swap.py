#!/usr/bin/env python3
"""
Production face swap pipeline.

Primary:  HyperSwap 1c (256x256, embedding-based, FaceFusion Labs 2025)
Fallback: inswapper_128 (128x128, InsightFace legacy)

Pipeline:
  1. Extract ArcFace embeddings from ALL source photos → average into one identity
  2. Detect face in target (FLUX-generated) image
  3. Swap using HyperSwap 1c 256 with averaged embedding [fallback: inswapper_128]
  4. Custom paste-back: feathered convex-hull mask + cv2.seamlessClone(MIXED_CLONE)
  5. LAB color histogram match (target skin → swapped face)
  6. CodeFormer face restoration (fidelity 0.75)  [fallback: GFPGAN ONNX]
  7. Real-ESRGAN x2 upscale                       [fallback: Lanczos]
"""

import os
import sys
import base64
import tempfile
import time

import cv2
import numpy as np

from storage import download_from_url


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def _log(msg: str):
    print(msg, flush=True)
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Model search paths (Docker image + ComfyUI pod + default insightface)
# ---------------------------------------------------------------------------

_MODEL_DIRS = [
    os.path.expanduser("~/.insightface/models"),
    "/usr/local/lib/python3.10/dist-packages/.assets/models",
    "/workspace/ComfyUI/models",
    "/workspace/ComfyUI/models/insightface/models",
    "/workspace/ComfyUI/models/facerestore_models",
    "/workspace/ComfyUI/models/upscale_models",
    "/app/models",
]


def _find_model(filename: str) -> str | None:
    """Search common directories for a model file."""
    for d in _MODEL_DIRS:
        p = os.path.join(d, filename)
        if os.path.isfile(p):
            return p
        # Also check one level deeper (e.g. buffalo_l/model.onnx)
        for sub in os.listdir(d) if os.path.isdir(d) else []:
            p2 = os.path.join(d, sub, filename)
            if os.path.isfile(p2):
                return p2
    return None


# ---------------------------------------------------------------------------
# Lazy-loaded singletons
# ---------------------------------------------------------------------------

_face_app = None
_swapper = None       # ("hyperswap", ort_session) or ("inswapper", insightface_model)
_restorer = None
_upscaler = None

# ArcFace alignment template for HyperSwap (128x128 crop, same as arcface_128)
# 5-point landmarks: left_eye, right_eye, nose, left_mouth, right_mouth
_ARCFACE_TEMPLATE_128 = np.array([
    [46.2946, 51.6963],
    [81.5318, 51.5014],
    [63.7366, 71.7366],
    [48.1678, 92.3655],
    [79.8856, 92.2041],
], dtype=np.float32)


def _get_ort_providers() -> list[str]:
    """Get available ONNX Runtime providers, preferring CUDA."""
    try:
        import onnxruntime as ort
        available = ort.get_available_providers()
        return [p for p in ["CUDAExecutionProvider", "CPUExecutionProvider"] if p in available]
    except Exception:
        return ["CPUExecutionProvider"]


def _get_face_app():
    """InsightFace FaceAnalysis — face detection + ArcFace embedding."""
    global _face_app
    if _face_app is not None:
        return _face_app

    from insightface.app import FaceAnalysis

    providers = _get_ort_providers()

    for model_name in ("buffalo_l", "antelopev2"):
        try:
            app = FaceAnalysis(name=model_name, providers=providers)
            app.prepare(ctx_id=0, det_size=(640, 640))
            _face_app = app
            _log(f"[face_swap] FaceAnalysis loaded: {model_name}")
            return _face_app
        except Exception as e:
            _log(f"[face_swap] FaceAnalysis({model_name}) failed: {e}")

    raise RuntimeError("No InsightFace model pack available (tried buffalo_l, antelopev2)")


def _get_swapper():
    """
    Load swap model. Preference order:
      1. hyperswap_1c_256.onnx (256x256, best quality, direct ONNX)
      2. inswapper_128.onnx (128x128, legacy InsightFace API)
    """
    global _swapper
    if _swapper is not None:
        return _swapper

    import onnxruntime as ort

    # --- Primary: HyperSwap 1c 256 ---
    for name in ("hyperswap_1c_256.onnx", "hyperswap_1b_256.onnx", "hyperswap_1a_256.onnx"):
        path = _find_model(name)
        if path:
            session = ort.InferenceSession(path, providers=_get_ort_providers())
            _swapper = ("hyperswap", session)
            _log(f"[face_swap] PRIMARY: {name} loaded from {path}")
            return _swapper

    # --- Fallback: inswapper_128 via InsightFace ---
    path = _find_model("inswapper_128.onnx")
    if path:
        import insightface
        model = insightface.model_zoo.get_model(path)
        _swapper = ("inswapper", model)
        _log(f"[face_swap] FALLBACK: inswapper_128 loaded from {path}")
        return _swapper

    raise RuntimeError("No swap model found (tried hyperswap_1c/1b/1a_256, inswapper_128)")


# ---------------------------------------------------------------------------
# CodeFormer restoration (with GFPGAN ONNX fallback)
# ---------------------------------------------------------------------------

def _get_restorer():
    """Load CodeFormer if available, else GFPGAN ONNX, else None."""
    global _restorer
    if _restorer is not None:
        return _restorer

    # Try CodeFormer (requires basicsr + facexlib)
    try:
        import torch
        from torchvision.transforms.functional import normalize as tv_normalize
        from basicsr.utils import img2tensor, tensor2img
        from basicsr.archs.codeformer_arch import CodeFormer as CodeFormerArch

        model_path = _find_model("codeformer-v0.1.0.pth") or _find_model("codeformer.pth")
        if model_path:
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            net = CodeFormerArch(
                dim_embd=512, codebook_size=1024, n_head=8, n_layers=9,
                connect_list=["32", "64", "128", "256"],
            ).to(device)
            ckpt = torch.load(model_path, map_location=device)
            net.load_state_dict(ckpt.get("params_ema", ckpt.get("params", ckpt)), strict=False)
            net.eval()
            _restorer = ("codeformer", net, device)
            _log(f"[face_swap] CodeFormer loaded from {model_path}")
            return _restorer
    except ImportError:
        _log("[face_swap] CodeFormer not available (missing basicsr/facexlib)")
    except Exception as e:
        _log(f"[face_swap] CodeFormer load failed: {e}")

    # Fallback: GFPGAN via ONNX (available in Docker image)
    try:
        import onnxruntime as ort
        gfpgan_path = _find_model("gfpgan_1.4.onnx")
        if gfpgan_path:
            providers = [p for p in ["CUDAExecutionProvider", "CPUExecutionProvider"]
                         if p in ort.get_available_providers()]
            session = ort.InferenceSession(gfpgan_path, providers=providers)
            _restorer = ("gfpgan_onnx", session, None)
            _log(f"[face_swap] GFPGAN ONNX loaded from {gfpgan_path}")
            return _restorer
    except Exception as e:
        _log(f"[face_swap] GFPGAN ONNX load failed: {e}")

    _restorer = ("none", None, None)
    _log("[face_swap] No face restoration model available")
    return _restorer


# ---------------------------------------------------------------------------
# Real-ESRGAN upscaler
# ---------------------------------------------------------------------------

def _get_upscaler():
    """Load Real-ESRGAN if available, else None."""
    global _upscaler
    if _upscaler is not None:
        return _upscaler

    try:
        from realesrgan import RealESRGANer
        from basicsr.archs.rrdbnet_arch import RRDBNet
        import torch

        model_path = (_find_model("RealESRGAN_x2plus.pth")
                      or _find_model("RealESRGAN_x4plus.pth"))
        if not model_path:
            raise FileNotFoundError("No Real-ESRGAN model found")

        is_x2 = "x2" in os.path.basename(model_path).lower()
        scale = 2 if is_x2 else 4
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64,
                        num_block=23, num_grow_ch=32, scale=scale)
        half = torch.cuda.is_available()
        upsampler = RealESRGANer(
            scale=scale, model_path=model_path, model=model,
            tile=0, tile_pad=10, pre_pad=0, half=half,
        )
        _upscaler = upsampler
        _log(f"[face_swap] Real-ESRGAN loaded from {model_path} (scale={scale})")
        return _upscaler
    except ImportError:
        _log("[face_swap] Real-ESRGAN not available (missing realesrgan/basicsr)")
    except Exception as e:
        _log(f"[face_swap] Real-ESRGAN load failed: {e}")

    _upscaler = "none"
    return _upscaler


# ---------------------------------------------------------------------------
# 1. Multi-image embedding extraction + averaging
# ---------------------------------------------------------------------------

class _SyntheticFace:
    """Minimal face object with averaged embedding for swap models."""
    def __init__(self, embedding: np.ndarray):
        norm = np.linalg.norm(embedding)
        self.normed_embedding = embedding / norm if norm > 0 else embedding
        self.embedding = self.normed_embedding
        # HyperSwap uses embedding_norm (same as normed_embedding)
        self.embedding_norm = self.normed_embedding


def average_embeddings(images: list[np.ndarray]) -> np.ndarray:
    """
    Extract ArcFace embedding from every image, return L2-normalized average.

    Uses the largest detected face in each image.
    Raises ValueError if no face found in ANY image.
    """
    app = _get_face_app()
    embeddings = []

    for i, img in enumerate(images):
        faces = app.get(img)
        if not faces:
            _log(f"[embed] No face in source image {i} — skipping")
            continue

        # Pick the largest face (most likely the primary subject)
        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        embeddings.append(face.normed_embedding)
        _log(f"[embed] Source {i}: face detected, bbox_area="
             f"{(face.bbox[2]-face.bbox[0])*(face.bbox[3]-face.bbox[1]):.0f}")

    if not embeddings:
        raise ValueError("No face detected in any source image")

    avg = np.mean(embeddings, axis=0).astype(np.float32)
    avg = avg / np.linalg.norm(avg)  # re-normalize
    _log(f"[embed] Averaged {len(embeddings)} embedding(s), norm={np.linalg.norm(avg):.4f}")
    return avg


# ---------------------------------------------------------------------------
# 2. Face mask creation
# ---------------------------------------------------------------------------

def _create_face_mask(
    img_shape: tuple[int, int, int],
    face,
    blur_radius: int = 21,
) -> np.ndarray:
    """
    Create a feathered face mask from face landmarks.

    Uses the convex hull of 2D landmarks (or kps fallback),
    then Gaussian blurs for soft edges.
    Returns float32 mask [0..1] at image resolution.
    """
    h, w = img_shape[:2]
    mask = np.zeros((h, w), dtype=np.float32)

    # Prefer detailed landmarks, fall back to key points
    if hasattr(face, "landmark_2d_106") and face.landmark_2d_106 is not None:
        pts = face.landmark_2d_106.astype(np.int32)
    elif hasattr(face, "landmark_3d_68") and face.landmark_3d_68 is not None:
        pts = face.landmark_3d_68[:, :2].astype(np.int32)
    elif hasattr(face, "kps") and face.kps is not None:
        pts = face.kps.astype(np.int32)
    else:
        # Last resort: bbox-based ellipse
        x1, y1, x2, y2 = face.bbox.astype(int)
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
        rx, ry = (x2 - x1) // 2, (y2 - y1) // 2
        cv2.ellipse(mask, (cx, cy), (rx, ry), 0, 0, 360, 1.0, -1)
        if blur_radius > 0:
            mask = cv2.GaussianBlur(mask, (blur_radius, blur_radius), 0)
        return mask

    hull = cv2.convexHull(pts)
    cv2.fillConvexPoly(mask, hull, 1.0)

    if blur_radius > 0:
        mask = cv2.GaussianBlur(mask, (blur_radius, blur_radius), 0)

    return mask


# ---------------------------------------------------------------------------
# 3. LAB color histogram matching
# ---------------------------------------------------------------------------

def _color_match_lab(
    swapped: np.ndarray,
    target: np.ndarray,
    mask: np.ndarray,
) -> np.ndarray:
    """
    Match LAB color statistics of the swapped face region to the target.

    Only modifies pixels where mask > 0.5.
    """
    mask_bool = mask > 0.5
    if mask_bool.sum() < 100:
        return swapped

    src_lab = cv2.cvtColor(swapped, cv2.COLOR_BGR2LAB).astype(np.float64)
    tgt_lab = cv2.cvtColor(target, cv2.COLOR_BGR2LAB).astype(np.float64)

    for c in range(3):
        src_vals = src_lab[:, :, c][mask_bool]
        tgt_vals = tgt_lab[:, :, c][mask_bool]

        src_mean, src_std = src_vals.mean(), max(src_vals.std(), 1e-6)
        tgt_mean, tgt_std = tgt_vals.mean(), max(tgt_vals.std(), 1e-6)

        # Remap source channel to match target statistics
        src_lab[:, :, c][mask_bool] = (
            (src_vals - src_mean) * (tgt_std / src_std) + tgt_mean
        )

    result = np.clip(src_lab, 0, 255).astype(np.uint8)
    return cv2.cvtColor(result, cv2.COLOR_LAB2BGR)


# ---------------------------------------------------------------------------
# 4. CodeFormer / GFPGAN face restoration
# ---------------------------------------------------------------------------

def _restore_face(img: np.ndarray, fidelity: float = 0.75) -> np.ndarray:
    """
    Apply face restoration to the full image.

    Uses CodeFormer (preferred) or GFPGAN ONNX (fallback).
    Processes only detected face crops, pastes back.
    """
    t0 = time.time()
    kind, model, device = _get_restorer()

    if kind == "none":
        _log("[restore] No restoration model — skipping")
        return img

    if kind == "codeformer":
        return _restore_codeformer(img, model, device, fidelity)

    if kind == "gfpgan_onnx":
        return _restore_gfpgan_onnx(img, model)

    return img


def _restore_codeformer(
    img: np.ndarray, net, device, fidelity: float
) -> np.ndarray:
    """CodeFormer: crop face, restore at 512x512, paste back."""
    import torch
    from basicsr.utils import img2tensor, tensor2img

    app = _get_face_app()
    faces = app.get(img)
    if not faces:
        _log("[restore] No face found for restoration — skipping")
        return img

    result = img.copy()
    for face in faces:
        x1, y1, x2, y2 = face.bbox.astype(int)
        # Expand crop by 30% for context
        h, w = img.shape[:2]
        pad_x = int((x2 - x1) * 0.15)
        pad_y = int((y2 - y1) * 0.15)
        cx1 = max(0, x1 - pad_x)
        cy1 = max(0, y1 - pad_y)
        cx2 = min(w, x2 + pad_x)
        cy2 = min(h, y2 + pad_y)

        crop = result[cy1:cy2, cx1:cx2]
        crop_resized = cv2.resize(crop, (512, 512), interpolation=cv2.INTER_LANCZOS4)

        # BGR [0,255] → RGB tensor [0,1] → normalize
        inp = img2tensor(crop_resized / 255.0, bgr2rgb=True, float32=True)
        inp = inp.unsqueeze(0).to(device)

        with torch.no_grad():
            output = net(inp, w=fidelity, adain=True)[0]

        restored = tensor2img(output, rgb2bgr=True, min_max=(-1, 1))
        restored = restored.astype(np.uint8)
        restored = cv2.resize(restored, (cx2 - cx1, cy2 - cy1),
                              interpolation=cv2.INTER_LANCZOS4)
        result[cy1:cy2, cx1:cx2] = restored

    _log(f"[restore] CodeFormer done (fidelity={fidelity})")
    return result


def _restore_gfpgan_onnx(img: np.ndarray, session) -> np.ndarray:
    """GFPGAN via ONNX: crop face, enhance at 512x512, paste back."""
    app = _get_face_app()
    faces = app.get(img)
    if not faces:
        _log("[restore] No face found for GFPGAN — skipping")
        return img

    result = img.copy()
    for face in faces:
        x1, y1, x2, y2 = face.bbox.astype(int)
        h, w = img.shape[:2]
        pad_x = int((x2 - x1) * 0.15)
        pad_y = int((y2 - y1) * 0.15)
        cx1 = max(0, x1 - pad_x)
        cy1 = max(0, y1 - pad_y)
        cx2 = min(w, x2 + pad_x)
        cy2 = min(h, y2 + pad_y)

        crop = result[cy1:cy2, cx1:cx2]
        crop_512 = cv2.resize(crop, (512, 512), interpolation=cv2.INTER_LANCZOS4)

        # Preprocess: BGR→RGB, [0,1], HWC→NCHW
        blob = crop_512[:, :, ::-1].astype(np.float32) / 255.0
        blob = (blob - 0.5) / 0.5  # normalize to [-1, 1]
        blob = blob.transpose(2, 0, 1)[np.newaxis, ...]

        inp_name = session.get_inputs()[0].name
        out = session.run(None, {inp_name: blob})[0]

        # Postprocess: NCHW→HWC, [-1,1]→[0,255], RGB→BGR
        out = out.squeeze(0).transpose(1, 2, 0)
        out = np.clip((out + 1) * 127.5, 0, 255).astype(np.uint8)
        out = out[:, :, ::-1]  # RGB→BGR

        out = cv2.resize(out, (cx2 - cx1, cy2 - cy1),
                         interpolation=cv2.INTER_LANCZOS4)
        result[cy1:cy2, cx1:cx2] = out

    _log("[restore] GFPGAN ONNX done")
    return result


# ---------------------------------------------------------------------------
# 5. Real-ESRGAN upscale
# ---------------------------------------------------------------------------

def _upscale(img: np.ndarray, outscale: int = 2) -> np.ndarray:
    """Real-ESRGAN upscale. Falls back to Lanczos if unavailable."""
    upscaler = _get_upscaler()
    if upscaler == "none":
        _log(f"[upscale] No Real-ESRGAN — Lanczos x{outscale} fallback")
        h, w = img.shape[:2]
        return cv2.resize(img, (w * outscale, h * outscale),
                          interpolation=cv2.INTER_LANCZOS4)

    t0 = time.time()
    output, _ = upscaler.enhance(img, outscale=outscale)
    _log(f"[upscale] Real-ESRGAN x{outscale} done ({time.time()-t0:.1f}s)")
    return output


# ---------------------------------------------------------------------------
# 6. Swap dispatcher (HyperSwap 256 primary, inswapper_128 fallback)
# ---------------------------------------------------------------------------

def _align_face_to_template(
    img: np.ndarray,
    kps_5: np.ndarray,
    template: np.ndarray,
    crop_size: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Align face to a reference template. Returns (aligned_crop, affine_matrix)."""
    M = cv2.estimateAffinePartial2D(kps_5, template * (crop_size / 128.0), method=cv2.LMEDS)[0]
    if M is None:
        M = cv2.estimateAffinePartial2D(kps_5, template * (crop_size / 128.0))[0]
    aligned = cv2.warpAffine(img, M, (crop_size, crop_size), borderMode=cv2.BORDER_REPLICATE)
    return aligned, M


def _run_swap(
    kind: str,
    model,
    target: np.ndarray,
    target_face,
    source_face: _SyntheticFace,
) -> np.ndarray | None:
    """
    Execute face swap using the loaded model.

    HyperSwap path:
      - Align target face to arcface_128 template at 256x256
      - Run ONNX: source=normed_embedding(1,512), target=preprocessed_crop(1,3,256,256)
      - Inverse-warp swapped crop back to original coords
      - Alpha composite onto target

    inswapper_128 path:
      - Use InsightFace's .get() API directly (handles alignment + paste internally)
    """
    if kind == "hyperswap":
        return _run_hyperswap(model, target, target_face, source_face)
    elif kind == "inswapper":
        try:
            return model.get(target.copy(), target_face, source_face, paste_back=True)
        except Exception as e:
            _log(f"[swap] inswapper_128 failed: {e}")
            return None
    return None


def _run_hyperswap(
    session,
    target: np.ndarray,
    target_face,
    source_face: _SyntheticFace,
) -> np.ndarray | None:
    """HyperSwap 256: align, swap via ONNX, paste back."""
    try:
        h, w = target.shape[:2]
        crop_size = 256

        # Get 5-point keypoints from target face
        kps = target_face.kps if hasattr(target_face, "kps") and target_face.kps is not None else None
        if kps is None or len(kps) < 5:
            _log("[hyperswap] No 5-point kps on target face — aborting")
            return None

        # Align target face to arcface template at 256x256
        aligned, M = _align_face_to_template(target, kps, _ARCFACE_TEMPLATE_128, crop_size)

        # Preprocess target crop: BGR→RGB, [0,1], normalize, NCHW
        target_blob = aligned[:, :, ::-1].astype(np.float32) / 255.0
        target_blob = (target_blob - 0.5) / 0.5  # → [-1, 1]
        target_blob = target_blob.transpose(2, 0, 1)[np.newaxis, ...]  # (1,3,256,256)

        # Source embedding: normed ArcFace embedding
        source_blob = source_face.normed_embedding.reshape(1, -1).astype(np.float32)

        # Get ONNX input names
        inputs = session.get_inputs()
        input_map = {}
        for inp in inputs:
            if "source" in inp.name.lower():
                input_map[inp.name] = source_blob
            elif "target" in inp.name.lower():
                input_map[inp.name] = target_blob
            else:
                # Guess by shape
                if inp.shape and len(inp.shape) == 2:
                    input_map[inp.name] = source_blob
                else:
                    input_map[inp.name] = target_blob

        # Run ONNX inference
        outputs = session.run(None, input_map)
        pred = outputs[0]  # (1, 3, 256, 256) RGB [-1, 1]

        # Postprocess: NCHW→HWC, [-1,1]→[0,255], RGB→BGR
        pred = pred.squeeze(0).transpose(1, 2, 0)
        pred = np.clip((pred + 1) * 127.5, 0, 255).astype(np.uint8)
        pred = pred[:, :, ::-1]  # RGB→BGR

        # Inverse-warp back to original image coordinates
        M_inv = cv2.invertAffineTransform(M)
        warped = cv2.warpAffine(pred, M_inv, (w, h), borderMode=cv2.BORDER_REPLICATE)

        # Create mask in aligned space, warp back for compositing
        mask_256 = np.ones((crop_size, crop_size), dtype=np.float32)
        # Shrink edges to avoid border artifacts
        border = 8
        mask_256[:border, :] = 0
        mask_256[-border:, :] = 0
        mask_256[:, :border] = 0
        mask_256[:, -border:] = 0
        mask_256 = cv2.GaussianBlur(mask_256, (15, 15), 5)
        mask_full = cv2.warpAffine(mask_256, M_inv, (w, h))

        # Alpha composite
        mask_3ch = np.stack([mask_full] * 3, axis=-1)
        result = (target.astype(np.float32) * (1 - mask_3ch) +
                  warped.astype(np.float32) * mask_3ch)
        result = np.clip(result, 0, 255).astype(np.uint8)

        _log(f"[hyperswap] 256x256 swap done, pred range=[{pred.min()},{pred.max()}]")
        return result

    except Exception as e:
        _log(f"[hyperswap] FAILED: {e}")
        import traceback
        traceback.print_exc()
        return None


# ---------------------------------------------------------------------------
# 7. Core swap pipeline
# ---------------------------------------------------------------------------

def swap_faces(
    source_paths: list[str],
    target_path: str,
) -> np.ndarray | None:
    """
    Full pipeline: multi-image identity → swap → blend → color → restore → upscale.

    Args:
        source_paths: 1+ paths to source face photos (all same person)
        target_path:  path to target image (FLUX-generated scene)

    Returns:
        Final BGR image or None on failure.
    """
    t0 = time.time()
    _log(f"[swap_faces] ENTER: {len(source_paths)} source(s), target={target_path}")

    # ── Load images ──────────────────────────────────────────────────
    sources = []
    for p in source_paths:
        img = cv2.imread(p)
        if img is not None:
            sources.append(img)
        else:
            _log(f"[swap_faces] Unreadable source: {p}")
    if not sources:
        _log("[swap_faces] FAIL: no readable sources")
        return None

    target = cv2.imread(target_path)
    if target is None:
        _log("[swap_faces] FAIL: target unreadable")
        return None

    _log(f"[swap_faces] Loaded {len(sources)} source(s), target={target.shape}")

    # ── 1. Extract & average embeddings ──────────────────────────────
    try:
        avg_embedding = average_embeddings(sources)
    except ValueError as e:
        _log(f"[swap_faces] FAIL: {e}")
        return None

    synthetic_face = _SyntheticFace(avg_embedding)

    # ── 2. Detect face in target ─────────────────────────────────────
    app = _get_face_app()
    target_faces = app.get(target)
    if not target_faces:
        _log("[swap_faces] FAIL: no face in target image")
        return None

    target_face = max(target_faces,
                      key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
    _log(f"[swap_faces] Target face bbox: {target_face.bbox.astype(int).tolist()}")

    # ── 3. Swap with averaged embedding ──────────────────────────────
    swap_kind, swap_model = _get_swapper()
    swapped = _run_swap(swap_kind, swap_model, target, target_face, synthetic_face)
    if swapped is None:
        _log("[swap_faces] FAIL: swap returned None")
        return None
    _log(f"[swap_faces] Swap done ({swap_kind}), shape={swapped.shape}")

    # ── 4. Create feathered face mask ────────────────────────────────
    mask = _create_face_mask(target.shape, target_face, blur_radius=21)
    _log(f"[swap_faces] Mask created, coverage={mask.sum()/mask.size*100:.1f}%")

    # ── 5. LAB color match (swapped → target skin tone) ─────────────
    swapped = _color_match_lab(swapped, target, mask)
    _log("[swap_faces] LAB color match done")

    # ── 6. seamlessClone with feathered mask ─────────────────────────
    mask_u8 = (mask * 255).astype(np.uint8)
    _, mask_binary = cv2.threshold(mask_u8, 1, 255, cv2.THRESH_BINARY)

    moments = cv2.moments(mask_binary)
    if moments["m00"] > 0:
        cx = int(moments["m10"] / moments["m00"])
        cy = int(moments["m01"] / moments["m00"])
        result = cv2.seamlessClone(swapped, target, mask_binary, (cx, cy), cv2.MIXED_CLONE)
        _log("[swap_faces] seamlessClone(MIXED_CLONE) done")
    else:
        # Fallback: alpha blend with feathered mask
        mask_3ch = np.stack([mask] * 3, axis=-1)
        result = (target.astype(np.float32) * (1 - mask_3ch) +
                  swapped.astype(np.float32) * mask_3ch)
        result = np.clip(result, 0, 255).astype(np.uint8)
        _log("[swap_faces] Alpha blend fallback (seamlessClone center failed)")

    # ── 7. CodeFormer / GFPGAN restoration ───────────────────────────
    result = _restore_face(result, fidelity=0.75)

    # ── 8. Real-ESRGAN x2 upscale ───────────────────────────────────
    result = _upscale(result, outscale=2)

    elapsed = round(time.time() - t0, 2)
    _log(f"[swap_faces] DONE: {result.shape}, {elapsed}s total")
    return result


# ---------------------------------------------------------------------------
# Public API — download, swap, encode
# ---------------------------------------------------------------------------

def warmup():
    """Pre-load models at worker startup."""
    _log("[face_swap] Warmup: loading models...")
    try:
        _get_face_app()
    except Exception as e:
        _log(f"[face_swap] Warmup FaceAnalysis failed: {e}")
    try:
        _get_swapper()
    except Exception as e:
        _log(f"[face_swap] Warmup inswapper failed: {e}")
    _get_restorer()
    _get_upscaler()
    _log("[face_swap] Warmup done")


def do_face_swap(
    user_photo_urls: list[str] | str,
    scenario_image_url: str,
) -> str | None:
    """
    Download images, run full swap pipeline, return base64-encoded JPEG.

    Accepts a list of source URLs (or single URL for backward compat).
    """
    if isinstance(user_photo_urls, str):
        user_photo_urls = [user_photo_urls]

    _log(f"[do_face_swap] ENTER: {len(user_photo_urls)} source(s)")

    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            # Download all source photos
            source_paths = []
            for i, url in enumerate(user_photo_urls):
                path = os.path.join(tmpdir, f"source_{i}.jpg")
                if download_from_url(url, path):
                    _log(f"[do_face_swap] Source {i}: {os.path.getsize(path)} bytes")
                    source_paths.append(path)
                else:
                    _log(f"[do_face_swap] Source {i} download failed — skipping")

            if not source_paths:
                _log("[do_face_swap] FAIL: all source downloads failed")
                return None

            # Download target
            target_path = os.path.join(tmpdir, "target.jpg")
            if not download_from_url(scenario_image_url, target_path):
                _log("[do_face_swap] FAIL: target download failed")
                return None

            # Run pipeline
            result = swap_faces(source_paths, target_path)
            if result is None:
                _log("[do_face_swap] FAIL: swap_faces returned None")
                return None

            # Encode
            ok, buf = cv2.imencode(".jpg", result, [cv2.IMWRITE_JPEG_QUALITY, 95])
            if not ok:
                _log("[do_face_swap] FAIL: imencode failed")
                return None

            b64 = base64.b64encode(buf.tobytes()).decode("ascii")
            _log(f"[do_face_swap] OK: {len(b64)} chars base64")
            return b64

        except Exception as e:
            import traceback
            _log(f"[do_face_swap] EXCEPTION: {e}\n{traceback.format_exc()}")
            return None
