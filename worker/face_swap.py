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
        detect_68_landmarks,
        FFHQ_TEMPLATE_512,
    )
    DETECTION_AVAILABLE = True
    _log("[face_swap] Face detection/mask/68-pt landmarks from face_enhance available")
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

def _add_boundary_points(landmarks: np.ndarray, img_shape: tuple[int, int]) -> np.ndarray:
    """Add 8 boundary points (corners + edge midpoints) for stable triangulation."""
    h, w = img_shape
    boundary = np.array([
        [0, 0], [w // 2, 0], [w - 1, 0],          # top
        [0, h // 2], [w - 1, h // 2],              # sides
        [0, h - 1], [w // 2, h - 1], [w - 1, h - 1],  # bottom
    ], dtype=np.float32)
    return np.vstack([landmarks, boundary])


def _warp_triangle(
    src_img: np.ndarray,
    dst_img: np.ndarray,
    src_tri: np.ndarray,
    dst_tri: np.ndarray,
) -> None:
    """Warp a single triangle from src_img into dst_img (in-place)."""
    # Bounding rects
    sr = cv2.boundingRect(np.float32([src_tri]))
    dr = cv2.boundingRect(np.float32([dst_tri]))

    # Clip to image bounds
    sh, sw = src_img.shape[:2]
    dh, dw = dst_img.shape[:2]

    sr_x1 = max(sr[0], 0)
    sr_y1 = max(sr[1], 0)
    sr_x2 = min(sr[0] + sr[2], sw)
    sr_y2 = min(sr[1] + sr[3], sh)
    dr_x1 = max(dr[0], 0)
    dr_y1 = max(dr[1], 0)
    dr_x2 = min(dr[0] + dr[2], dw)
    dr_y2 = min(dr[1] + dr[3], dh)

    if sr_x2 <= sr_x1 or sr_y2 <= sr_y1 or dr_x2 <= dr_x1 or dr_y2 <= dr_y1:
        return

    # Crop source and compute triangle coords relative to bounding rect
    src_crop = src_img[sr_y1:sr_y2, sr_x1:sr_x2]
    src_tri_rect = src_tri - np.float32([sr_x1, sr_y1])

    # Destination rect dimensions
    dr_w = dr_x2 - dr_x1
    dr_h = dr_y2 - dr_y1
    dst_tri_rect = dst_tri - np.float32([dr_x1, dr_y1])

    # Affine transform for this triangle
    M = cv2.getAffineTransform(
        np.float32(src_tri_rect[:3]),
        np.float32(dst_tri_rect[:3]),
    )
    warped = cv2.warpAffine(
        src_crop, M, (dr_w, dr_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT_101,
    )

    # Create triangle mask in destination rect space
    mask = np.zeros((dr_h, dr_w), dtype=np.uint8)
    cv2.fillConvexPoly(mask, np.int32(dst_tri_rect), 255)

    # Composite into destination image
    mask_bool = mask > 0
    dst_region = dst_img[dr_y1:dr_y2, dr_x1:dr_x2]
    dst_region[mask_bool] = warped[mask_bool]


def _direct_warp_swap(
    source_bgr: np.ndarray,
    target_bgr: np.ndarray,
) -> np.ndarray | None:
    """
    Warp the actual source face pixels onto the target image position
    using 68-point Delaunay triangulation (piecewise affine).

    No neural network touches the face — identity preserved exactly.

    Steps:
      1. Detect 68-pt landmarks in source and target (yoloface + 2dfan4)
      2. Add boundary points for stable triangulation
      3. Delaunay triangulate on target landmarks
      4. For each triangle: local affine warp source → target
      5. Create semantic face mask on the warped composite
      6. Poisson blend (cv2.seamlessClone) for seamless lighting match
    """
    t0 = time.time()

    # 1. Detect 68-point landmarks in both images
    _log("[warp_swap] Detecting 68-point landmarks…")
    src_68 = detect_68_landmarks(source_bgr)
    tgt_68 = detect_68_landmarks(target_bgr)

    if src_68 is None:
        _log("[warp_swap] No 68-pt landmarks in source — aborting")
        return None
    if tgt_68 is None:
        _log("[warp_swap] No 68-pt landmarks in target — aborting")
        return None

    _log(f"[warp_swap] Source 68pts range: x=[{src_68[:,0].min():.0f}..{src_68[:,0].max():.0f}] "
         f"y=[{src_68[:,1].min():.0f}..{src_68[:,1].max():.0f}]")
    _log(f"[warp_swap] Target 68pts range: x=[{tgt_68[:,0].min():.0f}..{tgt_68[:,0].max():.0f}] "
         f"y=[{tgt_68[:,1].min():.0f}..{tgt_68[:,1].max():.0f}]")

    detect_ms = round((time.time() - t0) * 1000)
    _log(f"[warp_swap] Landmark detection done ({detect_ms}ms)")

    # 2. Add boundary points for stable triangulation at image edges
    sh, sw = source_bgr.shape[:2]
    th, tw = target_bgr.shape[:2]

    src_pts = _add_boundary_points(src_68, (sh, sw))  # 68 + 8 = 76 points
    tgt_pts = _add_boundary_points(tgt_68, (th, tw))  # 68 + 8 = 76 points

    # 3. Delaunay triangulation on TARGET points
    _log("[warp_swap] Computing Delaunay triangulation…")
    rect = (0, 0, tw, th)
    subdiv = cv2.Subdiv2D(rect)

    # Insert target points, clamped to image bounds
    for pt in tgt_pts:
        x = float(np.clip(pt[0], 0, tw - 1))
        y = float(np.clip(pt[1], 0, th - 1))
        subdiv.insert((x, y))

    triangles = subdiv.getTriangleList()  # Nx6: [x1,y1,x2,y2,x3,y3]
    _log(f"[warp_swap] {len(triangles)} Delaunay triangles")

    # Build point index for fast lookup (target points → index)
    tgt_pts_list = tgt_pts.tolist()
    pt_to_idx = {}
    for i, pt in enumerate(tgt_pts_list):
        # Round to avoid float precision issues
        key = (round(pt[0], 1), round(pt[1], 1))
        pt_to_idx[key] = i

    def _find_idx(x: float, y: float) -> int | None:
        """Find index of nearest point within tolerance."""
        key = (round(x, 1), round(y, 1))
        if key in pt_to_idx:
            return pt_to_idx[key]
        # Fallback: brute-force nearest within 2px
        for i, pt in enumerate(tgt_pts_list):
            if abs(pt[0] - x) < 2.0 and abs(pt[1] - y) < 2.0:
                return i
        return None

    # 4. Warp each triangle: source → target
    _log("[warp_swap] Warping triangles…")
    t_warp = time.time()
    warped_face = target_bgr.copy()
    n_warped = 0

    for tri in triangles:
        x1, y1, x2, y2, x3, y3 = tri

        # Skip triangles outside image bounds
        if (x1 < 0 or x1 >= tw or y1 < 0 or y1 >= th or
            x2 < 0 or x2 >= tw or y2 < 0 or y2 >= th or
            x3 < 0 or x3 >= tw or y3 < 0 or y3 >= th):
            continue

        # Map triangle vertices to point indices
        i1 = _find_idx(x1, y1)
        i2 = _find_idx(x2, y2)
        i3 = _find_idx(x3, y3)

        if i1 is None or i2 is None or i3 is None:
            continue

        # Get corresponding source triangle
        src_tri = np.float32([src_pts[i1], src_pts[i2], src_pts[i3]])
        dst_tri = np.float32([tgt_pts[i1], tgt_pts[i2], tgt_pts[i3]])

        # Skip degenerate triangles
        area = abs((dst_tri[1][0] - dst_tri[0][0]) * (dst_tri[2][1] - dst_tri[0][1]) -
                    (dst_tri[2][0] - dst_tri[0][0]) * (dst_tri[1][1] - dst_tri[0][1]))
        if area < 1.0:
            continue

        _warp_triangle(source_bgr, warped_face, src_tri, dst_tri)
        n_warped += 1

    warp_ms = round((time.time() - t_warp) * 1000)
    _log(f"[warp_swap] Warped {n_warped} triangles ({warp_ms}ms)")

    if n_warped == 0:
        _log("[warp_swap] No triangles warped — aborting")
        return None

    # 5. Create semantic face mask on the WARPED composite
    # This mask covers only face interior (skin, eyes, nose, brows, mouth)
    _log("[warp_swap] Creating semantic mask…")
    t_mask = time.time()
    semantic_mask = create_semantic_face_mask(warped_face, feather=16)

    if semantic_mask is None:
        _log("[warp_swap] Semantic mask failed — trying simple ellipse mask")
        semantic_mask = _create_ellipse_mask(tgt_68[:5], (th, tw))

    if semantic_mask is None:
        _log("[warp_swap] All masking failed")
        return None

    mask_ms = round((time.time() - t_mask) * 1000)
    coverage = semantic_mask.sum() / semantic_mask.size * 100
    _log(f"[warp_swap] Mask done ({mask_ms}ms, coverage={coverage:.1f}%)")

    # 6. Poisson blend for seamless lighting transition
    _log("[warp_swap] Poisson blending…")
    t_blend = time.time()

    # seamlessClone needs a uint8 binary mask (0 or 255)
    mask_uint8 = (semantic_mask * 255).astype(np.uint8)
    _, mask_binary = cv2.threshold(mask_uint8, 127, 255, cv2.THRESH_BINARY)

    # Find mask center for seamlessClone
    moments = cv2.moments(mask_binary)
    if moments["m00"] == 0:
        _log("[warp_swap] Empty mask — aborting")
        return None
    cx = int(moments["m10"] / moments["m00"])
    cy = int(moments["m01"] / moments["m00"])

    result = cv2.seamlessClone(
        warped_face, target_bgr, mask_binary, (cx, cy), cv2.NORMAL_CLONE
    )

    blend_ms = round((time.time() - t_blend) * 1000)
    total_ms = round((time.time() - t0) * 1000)
    _log(f"[warp_swap] Done: {n_warped} triangles, detect={detect_ms}ms, "
         f"warp={warp_ms}ms, mask={mask_ms}ms, blend={blend_ms}ms, total={total_ms}ms")

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
    """Warmup — preload ONNX sessions (yoloface + 2dfan4)."""
    _log("[face_swap] Warmup: 68-pt Delaunay triangulation warp mode")
    if DETECTION_AVAILABLE:
        dummy = np.zeros((256, 256, 3), dtype=np.uint8)
        try:
            _detect_face_landmarks(dummy)
            _log("[face_swap] Warmup: yoloface loaded")
        except Exception as e:
            _log(f"[face_swap] Warmup: yoloface load failed (will retry on first call): {e}")
        try:
            detect_68_landmarks(dummy)
            _log("[face_swap] Warmup: 2dfan4 loaded")
        except Exception as e:
            _log(f"[face_swap] Warmup: 2dfan4 load failed (will retry on first call): {e}")
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
