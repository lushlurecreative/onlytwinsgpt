#!/usr/bin/env python3
"""
Post-swap face restoration using GFPGAN 1.4 ONNX.
Zero new dependencies — uses onnxruntime + opencv + numpy already in the Docker image.

Pipeline: yoloface_8n face detection → FFHQ 512 alignment → GFPGAN 1.4 → inverse warp → feathered blend.

Called from face_swap.py after inswapper_128 completes.
"""

import os
import sys
import time
import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Config (overridable via env vars)
# ---------------------------------------------------------------------------

MODELS_DIR = os.environ.get(
    "MODELS_DIR",
    "/usr/local/lib/python3.10/dist-packages/.assets/models",
)
GFPGAN_MODEL_PATH = os.path.join(MODELS_DIR, "gfpgan_1.4.onnx")
YOLO_MODEL_PATH = os.path.join(MODELS_DIR, "yoloface_8n.onnx")

# Blend: 0.0 = no enhancement, 1.0 = full GFPGAN.  0.85 is sweet spot.
DEFAULT_BLEND = float(os.environ.get("FACE_ENHANCE_BLEND", "0.85"))

# FFHQ 512x512 face alignment template (standard 5-point)
FFHQ_TEMPLATE_512 = np.array(
    [
        [192.98138, 239.94708],  # left eye
        [318.90277, 240.19366],  # right eye
        [256.63416, 314.01935],  # nose tip
        [201.26117, 371.41043],  # left mouth corner
        [313.08905, 371.15118],  # right mouth corner
    ],
    dtype=np.float32,
)


def _log(msg: str):
    print(msg, flush=True)
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def enhance_face_image(image_bgr: np.ndarray, blend: float = DEFAULT_BLEND) -> np.ndarray:
    """
    Enhance face quality in a post-swap image using GFPGAN 1.4.
    Returns enhanced image, or original unchanged if enhancement fails.

    blend: 0.0 = original only, 1.0 = fully enhanced.
    """
    if blend <= 0:
        return image_bgr

    if not os.path.isfile(GFPGAN_MODEL_PATH):
        _log(f"[face_enhance] GFPGAN model not found at {GFPGAN_MODEL_PATH} — skipping")
        return image_bgr
    if not os.path.isfile(YOLO_MODEL_PATH):
        _log(f"[face_enhance] YOLOFace model not found at {YOLO_MODEL_PATH} — skipping")
        return image_bgr

    t0 = time.time()
    try:
        result = _enhance_via_onnx(image_bgr, blend)
        elapsed = round(time.time() - t0, 2)
        _log(f"[face_enhance] Done ({elapsed}s, blend={blend})")
        return result
    except Exception as e:
        import traceback
        _log(f"[face_enhance] Enhancement failed, returning original: {e}")
        traceback.print_exc()
        return image_bgr


# ---------------------------------------------------------------------------
# GFPGAN via onnxruntime
# ---------------------------------------------------------------------------

_gfpgan_session = None
_yolo_session = None


def _get_gfpgan_session():
    global _gfpgan_session
    if _gfpgan_session is None:
        import onnxruntime as ort
        available = ort.get_available_providers()
        providers = [p for p in ["CUDAExecutionProvider", "CPUExecutionProvider"] if p in available]
        _gfpgan_session = ort.InferenceSession(GFPGAN_MODEL_PATH, providers=providers)
        _log(f"[face_enhance] GFPGAN session loaded (providers={providers})")
    return _gfpgan_session


def _get_yolo_session():
    global _yolo_session
    if _yolo_session is None:
        import onnxruntime as ort
        available = ort.get_available_providers()
        providers = [p for p in ["CUDAExecutionProvider", "CPUExecutionProvider"] if p in available]
        _yolo_session = ort.InferenceSession(YOLO_MODEL_PATH, providers=providers)
        _log(f"[face_enhance] YOLOFace session loaded (providers={providers})")
    return _yolo_session


def _enhance_via_onnx(image_bgr: np.ndarray, blend: float) -> np.ndarray:
    """Detect face → align 512 → GFPGAN → inverse warp → feathered blend."""
    _log("[face_enhance] Running GFPGAN enhancement…")

    # 1. Detect face (get 5-point landmarks)
    landmarks = _detect_face_landmarks(image_bgr)
    if landmarks is None:
        _log("[face_enhance] No face detected — skipping")
        return image_bgr

    # 2. Align face to 512×512
    aligned, affine_matrix = _align_face(image_bgr, landmarks)

    # 3. Run GFPGAN on aligned crop
    restored = _run_gfpgan(aligned)

    # 4. Paste back with feathered mask
    return _paste_back(image_bgr, restored, affine_matrix, blend)


# ---------------------------------------------------------------------------
# Face detection via yoloface_8n.onnx
# ---------------------------------------------------------------------------

def _detect_face_landmarks(image_bgr: np.ndarray) -> np.ndarray | None:
    """
    Detect the largest face and return 5-point landmarks [[x,y],...].
    Returns None if no face found.
    """
    session = _get_yolo_session()

    inp = session.get_inputs()[0]
    inp_shape = inp.shape  # e.g. [1, 3, 640, 640] or [1, 3, None, None]

    # Handle dynamic spatial dimensions — default to 640
    input_h = inp_shape[2] if isinstance(inp_shape[2], int) else 640
    input_w = inp_shape[3] if isinstance(inp_shape[3], int) else 640

    h, w = image_bgr.shape[:2]

    # Letterbox resize
    scale = min(input_w / w, input_h / h)
    new_w, new_h = int(w * scale), int(h * scale)
    resized = cv2.resize(image_bgr, (new_w, new_h))

    canvas = np.full((input_h, input_w, 3), 114, dtype=np.uint8)
    pad_x = (input_w - new_w) // 2
    pad_y = (input_h - new_h) // 2
    canvas[pad_y : pad_y + new_h, pad_x : pad_x + new_w] = resized

    # Preprocess: BGR→RGB, [0,1], HWC→NCHW
    blob = canvas[:, :, ::-1].astype(np.float32) / 255.0
    blob = blob.transpose(2, 0, 1)[np.newaxis, ...]

    # Inference
    outputs = session.run(None, {inp.name: blob})
    raw = outputs[0]
    _log(f"[face_detect] yoloface raw shape={raw.shape}")

    # Parse output into [N, features] regardless of model layout.
    # yoloface_8n outputs vary by version: [1, N, F] or [1, F, N]
    # where F is 15, 16, or 20 (bbox4 + conf1 + kps*2 + optional).
    det = np.squeeze(raw)
    if det.ndim == 1:
        det = det[np.newaxis, :]
    if det.ndim != 2:
        _log(f"[face_detect] Unexpected ndim={det.ndim} after squeeze — skipping")
        return None

    rows, cols = det.shape
    # We need at least 15 features per detection (4 bbox + 1 conf + 10 kps).
    # If the small dimension is the feature axis, transpose so features are in cols.
    MIN_FEATURES = 15
    if cols < MIN_FEATURES <= rows:
        det = det.T
        rows, cols = det.shape
        _log(f"[face_detect] Transposed to shape=({rows}, {cols})")

    if cols < MIN_FEATURES:
        _log(f"[face_detect] Too few feature columns ({cols}) — skipping")
        return None

    # Filter by confidence (col 4)
    scores = det[:, 4]
    valid = scores > 0.5
    det = det[valid]

    if len(det) == 0:
        _log("[face_detect] No detections above threshold")
        return None

    # Take highest confidence
    best = det[np.argmax(det[:, 4])]

    # Extract 5-point landmarks (cols 5-14)
    kps = best[5:15].reshape(5, 2).copy()

    # Scale from letterboxed coords → original image coords
    kps[:, 0] = (kps[:, 0] - pad_x) / scale
    kps[:, 1] = (kps[:, 1] - pad_y) / scale

    _log(f"[face_detect] Face found, score={best[4]:.3f}")
    return kps


# ---------------------------------------------------------------------------
# Face alignment
# ---------------------------------------------------------------------------

def _align_face(
    image_bgr: np.ndarray, landmarks_5: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Similarity-transform warp face to 512×512 FFHQ alignment."""
    src = landmarks_5.astype(np.float64)
    dst = FFHQ_TEMPLATE_512.astype(np.float64)
    M, _ = cv2.estimateAffinePartial2D(src, dst, method=cv2.LMEDS)
    if M is None:
        M, _ = cv2.estimateAffinePartial2D(src, dst)
    aligned = cv2.warpAffine(
        image_bgr, M, (512, 512), borderValue=(135, 133, 132)
    )
    return aligned, M


# ---------------------------------------------------------------------------
# GFPGAN inference
# ---------------------------------------------------------------------------

def _run_gfpgan(aligned_bgr: np.ndarray) -> np.ndarray:
    """
    Run GFPGAN 1.4 on a 512×512 aligned face crop.  Returns 512×512 BGR.

    GFPGAN 1.4 ONNX expects input in [-1, 1] and outputs in [-1, 1]:
      input  = (pixel / 255.0 - 0.5) / 0.5    →  [-1, 1]
      output = clip(output, -1, 1)
      pixel  = (output + 1) / 2 * 255          →  [0, 255]
    """
    session = _get_gfpgan_session()

    # Preprocess: BGR→RGB, normalize to [-1, 1], HWC→NCHW
    face = aligned_bgr[:, :, ::-1].astype(np.float32) / 255.0
    face = (face - 0.5) / 0.5  # [0,1] → [-1,1]
    face = face.transpose(2, 0, 1)[np.newaxis, ...]

    input_name = session.get_inputs()[0].name
    result = session.run(None, {input_name: face})[0]

    # Postprocess: NCHW→HWC, [-1,1]→[0,255], RGB→BGR
    result = result[0].transpose(1, 2, 0)
    result = np.clip(result, -1.0, 1.0)
    result = ((result + 1.0) / 2.0 * 255.0).astype(np.uint8)
    result = result[:, :, ::-1]
    return result


# ---------------------------------------------------------------------------
# Paste back with feathered mask
# ---------------------------------------------------------------------------

def _paste_back(
    original_bgr: np.ndarray,
    enhanced_aligned: np.ndarray,
    affine_matrix: np.ndarray,
    blend: float,
) -> np.ndarray:
    """Inverse-warp enhanced face, feathered-blend onto original image."""
    h, w = original_bgr.shape[:2]
    M_inv = cv2.invertAffineTransform(affine_matrix)

    # Soft mask in 512×512 aligned space — zeroed borders + Gaussian feather
    mask = np.ones((512, 512), dtype=np.float32)
    border = 24
    mask[:border, :] = 0
    mask[-border:, :] = 0
    mask[:, :border] = 0
    mask[:, -border:] = 0
    mask = cv2.GaussianBlur(mask, (101, 101), 30)

    # Warp enhanced face + mask back to original image space
    warped_face = cv2.warpAffine(enhanced_aligned, M_inv, (w, h))
    warped_mask = cv2.warpAffine(mask, M_inv, (w, h))

    # Apply blend strength
    warped_mask = warped_mask * blend

    # Alpha composite
    m3 = warped_mask[:, :, np.newaxis]
    result = original_bgr.astype(np.float64) * (1.0 - m3) + warped_face.astype(np.float64) * m3
    return np.clip(result, 0, 255).astype(np.uint8)
