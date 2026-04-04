#!/usr/bin/env python3
"""
Face-swap module using FaceFusion (industry-leading face swap).
Downloads user photo and scenario image, swaps faces, returns base64.
"""

import os
import base64
import tempfile
import cv2
import numpy as np
from storage import download_from_url


def _fix_exif_orientation(image_path: str) -> None:
    """
    Apply EXIF orientation tag to pixel data and re-save.
    Phone cameras store raw sensor data + EXIF rotation tag.
    cv2.imread ignores EXIF, so the face can be sideways.
    This causes wrong landmarks → wrong ArcFace embedding → wrong identity.
    """
    try:
        from PIL import Image, ImageOps
        img = Image.open(image_path)
        exif = img.getexif()
        orientation = exif.get(0x0112)  # EXIF Orientation tag
        if orientation is not None and orientation != 1:
            img = ImageOps.exif_transpose(img)
            # Save back — use original format, max quality to avoid recompression loss
            fmt = img.format or "JPEG"
            save_kwargs = {"quality": 100} if fmt == "JPEG" else {}
            img.save(image_path, format=fmt, **save_kwargs)
            print(f"[exif] Fixed orientation {orientation} → 1 for {image_path}", flush=True)
        else:
            print(f"[exif] No rotation needed (orientation={orientation}) for {image_path}", flush=True)
    except ImportError:
        print("[exif] Pillow not available — skipping EXIF fix", flush=True)
    except Exception as e:
        # Non-fatal: if EXIF fix fails, proceed with original image
        print(f"[exif] Could not fix orientation: {e}", flush=True)

try:
    from facefusionlib import swapper
    from facefusionlib.swapper import DeviceProvider
    FACEFUSION_AVAILABLE = True
    print("[face_swap] FaceFusion library available", flush=True)
except ImportError as e:
    FACEFUSION_AVAILABLE = False
    print(f"[face_swap] FaceFusion not available: {e}", flush=True)
except Exception as e:
    FACEFUSION_AVAILABLE = False
    print(f"[face_swap] FaceFusion import error (non-ImportError): {e}", flush=True)
    import traceback
    traceback.print_exc()

try:
    from face_enhance import enhance_face_image
    ENHANCE_AVAILABLE = True
    print("[face_swap] Face enhancement available", flush=True)
except ImportError:
    ENHANCE_AVAILABLE = False
    print("[face_swap] Face enhancement not available (face_enhance module missing)", flush=True)
except Exception as e:
    ENHANCE_AVAILABLE = False
    print(f"[face_swap] Face enhancement import error: {e}", flush=True)


def _log(msg: str):
    """Guaranteed log line with forced flush."""
    import sys
    print(msg, flush=True)
    sys.stdout.flush()
    sys.stderr.flush()


def warmup():
    """Warmup — trigger model download on first import if needed."""
    if not FACEFUSION_AVAILABLE:
        _log("[face_swap] Cannot warmup: facefusionlib not installed")
        _log("[face_swap] Checking what IS installed...")
        try:
            import pkg_resources
            installed = [str(d) for d in pkg_resources.working_set]
            face_pkgs = [p for p in installed if 'face' in p.lower() or 'onnx' in p.lower() or 'swap' in p.lower()]
            _log(f"[face_swap] Relevant packages: {face_pkgs}")
        except Exception:
            pass
        return

    import time
    start = time.time()
    _log("[face_swap] Warming up FaceFusion...")

    # Log onnxruntime providers
    try:
        import onnxruntime as ort
        providers = ort.get_available_providers()
        _log(f"[face_swap] ONNX Runtime providers: {providers}")
    except Exception as e:
        _log(f"[face_swap] ONNX Runtime check failed: {e}")

    # Run a tiny test swap to trigger model downloads and GPU init
    try:
        test_dir = tempfile.mkdtemp()
        test_img = np.zeros((256, 256, 3), dtype=np.uint8)
        test_img[60:200, 60:200] = 200
        test_src = os.path.join(test_dir, "test_src.jpg")
        test_tgt = os.path.join(test_dir, "test_tgt.jpg")
        cv2.imwrite(test_src, test_img)
        cv2.imwrite(test_tgt, test_img)

        try:
            _log("[face_swap] Running warmup swap (CPU, dummy images)...")
            swapper.swap_face(
                source_paths=[test_src],
                target_path=test_tgt,
                provider=DeviceProvider.CPU,
                detector_score=0.1,
            )
            _log("[face_swap] Warmup swap completed (models downloaded)")
        except Exception as e:
            _log(f"[face_swap] Warmup swap expected error (models should be cached): {e}")

        import shutil
        shutil.rmtree(test_dir, ignore_errors=True)
    except Exception as e:
        import traceback
        _log(f"[face_swap] Warmup failed: {e}\n{traceback.format_exc()}")

    elapsed = round(time.time() - start, 1)
    _log(f"[face_swap] Warmup complete in {elapsed}s")


def swap_faces(user_photo_path: str, scenario_image_path: str) -> np.ndarray | None:
    """
    Swap face from user_photo into scenario_image using FaceFusion,
    then enhance with GFPGAN face restoration + feathered blending.
    Returns the final image as numpy array, or None if swap fails.
    """
    _log(f"[swap_faces] ENTER user={user_photo_path} scenario={scenario_image_path}")

    if not FACEFUSION_AVAILABLE:
        _log("[swap_faces] RETURN_NONE reason=facefusion_not_available")
        return None

    import time as _time
    try:
        t0 = _time.time()

        # Determine provider — prefer GPU
        try:
            import onnxruntime as ort
            providers = ort.get_available_providers()
            if 'CUDAExecutionProvider' in providers:
                provider = DeviceProvider.GPU
                _log("[swap_faces] Using GPU provider")
            else:
                provider = DeviceProvider.CPU
                _log("[swap_faces] Using CPU provider (no CUDA)")
        except Exception:
            provider = DeviceProvider.CPU
            _log("[swap_faces] Using CPU provider (onnxruntime check failed)")

        # Run FaceFusion face swap
        _log("[swap_faces] Starting FaceFusion swap...")
        t_swap = _time.time()

        # Log input image sizes for diagnostics
        src_img = cv2.imread(user_photo_path)
        tgt_img = cv2.imread(scenario_image_path)
        _log(f"[swap_faces] source_size={src_img.shape if src_img is not None else 'NONE'} target_size={tgt_img.shape if tgt_img is not None else 'NONE'}")

        result = swapper.swap_face(
            source_paths=[user_photo_path],
            target_path=scenario_image_path,
            provider=provider,
            detector_score=0.65,
            mask_blur=0.5,
            landmarker_score=0.5,
        )

        swap_elapsed = round(_time.time() - t_swap, 2)
        _log(f"[swap_faces] FaceFusion returned: type={type(result).__name__} ({swap_elapsed}s)")

        # ── Parse swap result into ndarray ────────────────────────────
        swapped_img = None

        if result is None:
            _log("[swap_faces] RETURN_NONE reason=swap_returned_none")
            return None

        if isinstance(result, np.ndarray):
            _log(f"[swap_faces] OK result is ndarray shape={result.shape}")
            swapped_img = result

        elif isinstance(result, str) and os.path.exists(result):
            _log(f"[swap_faces] OK result is file path: {result}")
            swapped_img = cv2.imread(result)

        else:
            result_str = str(result)
            if os.path.exists(result_str):
                _log(f"[swap_faces] OK result converted to path: {result_str}")
                swapped_img = cv2.imread(result_str)
            else:
                _log(f"[swap_faces] RETURN_NONE reason=unknown_result_type value={result_str[:200]}")
                return None

        if swapped_img is None:
            _log("[swap_faces] RETURN_NONE reason=could_not_read_result")
            return None

        # Diff check — verify swap actually changed pixels
        if tgt_img is not None and swapped_img.shape == tgt_img.shape:
            diff = cv2.absdiff(swapped_img, tgt_img)
            changed_pixels = np.count_nonzero(diff)
            total_pixels = diff.size
            change_pct = round(100 * changed_pixels / total_pixels, 1)
            _log(f"[swap_faces] DIFF_CHECK changed={change_pct}% pixels ({changed_pixels}/{total_pixels})")
            if change_pct < 1.0:
                _log("[swap_faces] WARNING: output nearly identical to input — swap may not have worked")

        # ── Stage 3: GFPGAN face restoration + feathered blend ────────
        if ENHANCE_AVAILABLE:
            _log("[swap_faces] Running face enhancement (GFPGAN)...")
            t_enhance = _time.time()
            swapped_img = enhance_face_image(swapped_img)
            enhance_elapsed = round(_time.time() - t_enhance, 2)
            _log(f"[swap_faces] Enhancement done ({enhance_elapsed}s)")
        else:
            _log("[swap_faces] Enhancement not available — returning raw swap")

        total_elapsed = round(_time.time() - t0, 2)
        _log(f"[swap_faces] DONE shape={swapped_img.shape} ({total_elapsed}s total)")
        return swapped_img

    except Exception as e:
        import traceback
        _log(f"[swap_faces] RETURN_NONE reason=exception error={e}\n{traceback.format_exc()}")
        return None


def do_face_swap(user_photo_url: str, scenario_image_url: str) -> str | None:
    """
    Download images, swap faces with FaceFusion, return base64-encoded JPEG.
    """
    import time as _time
    _log(f"[do_face_swap] ENTER user_url={user_photo_url[:80]} scenario_url={scenario_image_url[:80]}")
    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            user_photo_path = os.path.join(tmpdir, "user.jpg")
            scenario_path = os.path.join(tmpdir, "scenario.jpg")

            if not download_from_url(user_photo_url, user_photo_path):
                _log("[do_face_swap] RETURN_NONE reason=download_user_failed")
                return None
            _log(f"[do_face_swap] OK step=download_user: {os.path.getsize(user_photo_path)} bytes")

            # Fix EXIF orientation BEFORE FaceFusion reads the source face.
            # Phone photos store rotated pixels + EXIF tag; cv2.imread ignores EXIF.
            # A sideways face → wrong landmarks → wrong ArcFace embedding → wrong identity.
            _fix_exif_orientation(user_photo_path)

            if not download_from_url(scenario_image_url, scenario_path):
                _log("[do_face_swap] RETURN_NONE reason=download_scenario_failed")
                return None
            _log(f"[do_face_swap] OK step=download_scenario: {os.path.getsize(scenario_path)} bytes")

            t_swap = _time.time()
            swapped_array = swap_faces(user_photo_path, scenario_path)
            swap_elapsed = round(_time.time() - t_swap, 2)
            if swapped_array is None:
                _log(f"[do_face_swap] RETURN_NONE reason=swap_faces_returned_none elapsed={swap_elapsed}s")
                return None
            _log(f"[do_face_swap] OK step=swap_faces: shape={swapped_array.shape} ({swap_elapsed}s)")

            # Encode as high-quality JPEG
            success, buf = cv2.imencode('.jpg', swapped_array, [cv2.IMWRITE_JPEG_QUALITY, 95])
            if not success:
                _log("[do_face_swap] RETURN_NONE reason=imencode_failed")
                return None
            b64 = base64.b64encode(buf.tobytes()).decode('ascii')
            _log(f"[do_face_swap] OK step=encode: {len(b64)} chars base64 ({len(buf)} bytes jpeg)")
            return b64
        except Exception as e:
            import traceback
            _log(f"[do_face_swap] RETURN_NONE reason=exception error={e}\n{traceback.format_exc()}")
            return None
