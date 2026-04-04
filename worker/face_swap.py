#!/usr/bin/env python3
"""
Face-swap module: Direct Source Pixel Warp.

Replaces inswapper_128 neural-net face generation with actual source photo pixels.
The user's real face is affine-warped to match the target position, masked to
face-interior-only via face_parser, and Poisson-blended for seamless lighting.

Identity is preserved exactly because no neural network touches the face pixels.
"""

import os
import base64
import sys
import tempfile
import time
import cv2
import numpy as np
from storage import download_from_url


def _log(msg: str):
    print(msg, flush=True)
    sys.stdout.flush()


def _fix_exif_orientation(image_path: str) -> None:
    """Apply EXIF orientation tag to pixel data and re-save."""
    try:
        from PIL import Image, ImageOps
        img = Image.open(image_path)
        exif = img.getexif()
        orientation = exif.get(0x0112)
        if orientation is not None and orientation != 1:
            img = ImageOps.exif_transpose(img)
            fmt = img.format or "JPEG"
            save_kwargs = {"quality": 100} if fmt == "JPEG" else {}
            img.save(image_path, format=fmt, **save_kwargs)
            _log(f"[exif] Fixed orientation {orientation} → 1 for {image_path}")
        else:
            _log(f"[exif] No rotation needed (orientation={orientation})")
    except ImportError:
        _log("[exif] Pillow not available — skipping EXIF fix")
    except Exception as e:
        _log(f"[exif] Could not fix orientation: {e}")


# ---------------------------------------------------------------------------
# Face detection — reuse yoloface from face_enhance.py
# ---------------------------------------------------------------------------

try:
    from face_enhance import (
        _detect_face_landmarks,
        _align_face,
        create_semantic_face_mask,
        FFHQ_TEMPLATE_512,
    )
    DETECTION_AVAILABLE = True
    _log("[face_swap] Face detection/mask from face_enhance available")
except ImportError:
    DETECTION_AVAILABLE = False
    _log("[face_swap] face_enhance not available — direct warp disabled")
except Exception as e:
    DETECTION_AVAILABLE = False
    _log(f"[face_swap] face_enhance import error: {e}")


# ---------------------------------------------------------------------------
# Legacy FaceFusion — kept as fallback only
# ---------------------------------------------------------------------------

try:
    from facefusionlib import swapper
    from facefusionlib.swapper import DeviceProvider
    FACEFUSION_AVAILABLE = True
except ImportError:
    FACEFUSION_AVAILABLE = False
except Exception:
    FACEFUSION_AVAILABLE = False


# ---------------------------------------------------------------------------
# Core: Direct Source Pixel Warp
# ---------------------------------------------------------------------------

def _direct_warp_swap(
    source_bgr: np.ndarray,
    target_bgr: np.ndarray,
) -> np.ndarray | None:
    """
    Warp the actual source face pixels onto the target image position.
    No neural network touches the face — identity preserved exactly.

    Steps:
      1. Detect 5-pt landmarks in source and target (yoloface)
      2. Compute similarity transform: source face → target face position
      3. Warp source image so face lands at target location/size/rotation
      4. Create semantic face mask (face_parser) on the warped result
      5. Poisson blend (cv2.seamlessClone) for seamless lighting match
    """
    t0 = time.time()

    # 1. Detect faces in both images
    _log("[warp_swap] Detecting landmarks…")
    src_landmarks = _detect_face_landmarks(source_bgr)
    tgt_landmarks = _detect_face_landmarks(target_bgr)

    if src_landmarks is None:
        _log("[warp_swap] No face detected in source")
        return None
    if tgt_landmarks is None:
        _log("[warp_swap] No face detected in target")
        return None

    _log(f"[warp_swap] Source landmarks: {src_landmarks.tolist()}")
    _log(f"[warp_swap] Target landmarks: {tgt_landmarks.tolist()}")

    # 2. Compute similarity transform: source landmarks → target landmarks
    src_pts = src_landmarks.astype(np.float64)
    tgt_pts = tgt_landmarks.astype(np.float64)
    M, _ = cv2.estimateAffinePartial2D(src_pts, tgt_pts, method=cv2.LMEDS)
    if M is None:
        M, _ = cv2.estimateAffinePartial2D(src_pts, tgt_pts)
    if M is None:
        _log("[warp_swap] Could not compute affine transform")
        return None

    _log(f"[warp_swap] Affine matrix: scale={np.sqrt(M[0,0]**2 + M[0,1]**2):.3f}")

    # 3. Warp entire source image so face lands at target position
    h, w = target_bgr.shape[:2]
    warped_source = cv2.warpAffine(
        source_bgr, M, (w, h),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REFLECT_101,
    )

    warp_ms = round((time.time() - t0) * 1000)
    _log(f"[warp_swap] Warp done ({warp_ms}ms)")

    # 4. Create semantic face mask on the WARPED source
    # This mask covers only face interior (skin, eyes, nose, brows, mouth)
    # — no ears, hair, neck, or background from the source photo
    _log("[warp_swap] Creating semantic mask…")
    t_mask = time.time()
    semantic_mask = create_semantic_face_mask(warped_source, feather=16)

    if semantic_mask is None:
        _log("[warp_swap] Semantic mask failed — trying simple ellipse mask")
        semantic_mask = _create_ellipse_mask(tgt_landmarks, (h, w))

    if semantic_mask is None:
        _log("[warp_swap] All masking failed")
        return None

    mask_ms = round((time.time() - t_mask) * 1000)
    coverage = semantic_mask.sum() / semantic_mask.size * 100
    _log(f"[warp_swap] Mask done ({mask_ms}ms, coverage={coverage:.1f}%)")

    # 5. Poisson blend for seamless lighting transition
    _log("[warp_swap] Poisson blending…")
    t_blend = time.time()

    # seamlessClone needs a uint8 binary mask (0 or 255)
    mask_uint8 = (semantic_mask * 255).astype(np.uint8)
    # Threshold to clean binary — Poisson solver needs clean edges
    _, mask_binary = cv2.threshold(mask_uint8, 127, 255, cv2.THRESH_BINARY)

    # Find mask center for seamlessClone
    moments = cv2.moments(mask_binary)
    if moments["m00"] == 0:
        _log("[warp_swap] Empty mask — aborting")
        return None
    cx = int(moments["m10"] / moments["m00"])
    cy = int(moments["m01"] / moments["m00"])

    result = cv2.seamlessClone(
        warped_source, target_bgr, mask_binary, (cx, cy), cv2.NORMAL_CLONE
    )

    blend_ms = round((time.time() - t_blend) * 1000)
    total_ms = round((time.time() - t0) * 1000)
    _log(f"[warp_swap] Blend done ({blend_ms}ms), total={total_ms}ms")

    return result


def _create_ellipse_mask(
    landmarks: np.ndarray, img_shape: tuple[int, int], scale: float = 1.6
) -> np.ndarray | None:
    """
    Fallback: create an elliptical mask centered on the face landmarks.
    Used if face_parser is unavailable.
    """
    try:
        h, w = img_shape
        # Face center from landmarks
        cx = int(landmarks[:, 0].mean())
        cy = int(landmarks[:, 1].mean())

        # Face size from eye-to-eye distance
        eye_dist = np.linalg.norm(landmarks[0] - landmarks[1])
        rx = int(eye_dist * scale)
        ry = int(eye_dist * scale * 1.3)  # taller than wide

        mask = np.zeros((h, w), dtype=np.float32)
        cv2.ellipse(mask, (cx, cy), (rx, ry), 0, 0, 360, 1.0, -1)
        mask = cv2.GaussianBlur(mask, (31, 31), 10)
        return mask
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def warmup():
    """Warmup — preload ONNX sessions."""
    _log("[face_swap] Warmup: direct pixel warp mode")
    if DETECTION_AVAILABLE:
        try:
            # Force-load the yoloface session
            _detect_face_landmarks(np.zeros((256, 256, 3), dtype=np.uint8))
            _log("[face_swap] Warmup: yoloface loaded")
        except Exception as e:
            _log(f"[face_swap] Warmup: yoloface load failed (will retry on first call): {e}")
    else:
        _log("[face_swap] Warmup: detection not available, will fall back to FaceFusion")


def swap_faces(user_photo_path: str, scenario_image_path: str) -> np.ndarray | None:
    """
    Replace the face in scenario_image with the actual pixels from user_photo.

    Primary path: direct source pixel warp (preserves exact identity).
    Fallback: FaceFusion inswapper_128 (if direct warp fails).
    """
    _log(f"[swap_faces] ENTER user={user_photo_path} scenario={scenario_image_path}")

    t0 = time.time()

    src_img = cv2.imread(user_photo_path)
    tgt_img = cv2.imread(scenario_image_path)

    if src_img is None:
        _log("[swap_faces] RETURN_NONE reason=source_unreadable")
        return None
    if tgt_img is None:
        _log("[swap_faces] RETURN_NONE reason=target_unreadable")
        return None

    _log(f"[swap_faces] source={src_img.shape} target={tgt_img.shape}")

    # ── Primary: direct pixel warp (exact identity) ──────────────────
    if DETECTION_AVAILABLE:
        _log("[swap_faces] Using DIRECT PIXEL WARP (no neural net face generation)")
        result = _direct_warp_swap(src_img, tgt_img)
        if result is not None:
            elapsed = round(time.time() - t0, 2)
            _log(f"[swap_faces] DONE via direct warp ({elapsed}s)")
            return result
        _log("[swap_faces] Direct warp failed — falling back to FaceFusion")

    # ── Fallback: FaceFusion inswapper_128 ────────────────────────────
    if FACEFUSION_AVAILABLE:
        _log("[swap_faces] FALLBACK: FaceFusion inswapper_128")
        try:
            import onnxruntime as ort
            provs = ort.get_available_providers()
            provider = DeviceProvider.GPU if "CUDAExecutionProvider" in provs else DeviceProvider.CPU
        except Exception:
            provider = DeviceProvider.CPU

        result = swapper.swap_face(
            source_paths=[user_photo_path],
            target_path=scenario_image_path,
            provider=provider,
            detector_score=0.65,
            mask_blur=0.3,
            landmarker_score=0.5,
        )

        swapped_img = None
        if isinstance(result, np.ndarray):
            swapped_img = result
        elif isinstance(result, str) and os.path.exists(result):
            swapped_img = cv2.imread(result)
        elif result is not None:
            path = str(result)
            if os.path.exists(path):
                swapped_img = cv2.imread(path)

        if swapped_img is not None:
            elapsed = round(time.time() - t0, 2)
            _log(f"[swap_faces] DONE via FaceFusion fallback ({elapsed}s)")
            return swapped_img

    _log("[swap_faces] RETURN_NONE reason=all_methods_failed")
    return None


def do_face_swap(user_photo_url: str, scenario_image_url: str) -> str | None:
    """Download images, swap faces, return base64-encoded JPEG."""
    _log(f"[do_face_swap] ENTER user_url={user_photo_url[:80]} scenario_url={scenario_image_url[:80]}")

    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            user_photo_path = os.path.join(tmpdir, "user.jpg")
            scenario_path = os.path.join(tmpdir, "scenario.jpg")

            if not download_from_url(user_photo_url, user_photo_path):
                _log("[do_face_swap] RETURN_NONE reason=download_user_failed")
                return None
            _log(f"[do_face_swap] OK download_user: {os.path.getsize(user_photo_path)} bytes")

            _fix_exif_orientation(user_photo_path)

            if not download_from_url(scenario_image_url, scenario_path):
                _log("[do_face_swap] RETURN_NONE reason=download_scenario_failed")
                return None
            _log(f"[do_face_swap] OK download_scenario: {os.path.getsize(scenario_path)} bytes")

            t_swap = time.time()
            swapped = swap_faces(user_photo_path, scenario_path)
            elapsed = round(time.time() - t_swap, 2)

            if swapped is None:
                _log(f"[do_face_swap] RETURN_NONE reason=swap_failed ({elapsed}s)")
                return None
            _log(f"[do_face_swap] OK swap: shape={swapped.shape} ({elapsed}s)")

            success, buf = cv2.imencode(".jpg", swapped, [cv2.IMWRITE_JPEG_QUALITY, 95])
            if not success:
                _log("[do_face_swap] RETURN_NONE reason=imencode_failed")
                return None

            b64 = base64.b64encode(buf.tobytes()).decode("ascii")
            _log(f"[do_face_swap] OK encode: {len(b64)} chars base64")
            return b64

        except Exception as e:
            import traceback
            _log(f"[do_face_swap] RETURN_NONE reason=exception error={e}\n{traceback.format_exc()}")
            return None
