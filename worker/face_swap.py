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

try:
    from facefusionlib import swapper
    from facefusionlib.swapper import DeviceProvider
    FACEFUSION_AVAILABLE = True
    print("[face_swap] FaceFusion library available", flush=True)
except ImportError as e:
    FACEFUSION_AVAILABLE = False
    print(f"[face_swap] FaceFusion not available: {e}", flush=True)


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
        return

    import time
    start = time.time()
    _log("[face_swap] Warming up FaceFusion...")

    # Run a tiny test swap to trigger model downloads and GPU init
    try:
        # Create minimal test images (small solid color with a rough face-like region)
        test_dir = tempfile.mkdtemp()
        test_img = np.zeros((256, 256, 3), dtype=np.uint8)
        test_img[60:200, 60:200] = 200  # bright square as fake face region
        test_src = os.path.join(test_dir, "test_src.jpg")
        test_tgt = os.path.join(test_dir, "test_tgt.jpg")
        cv2.imwrite(test_src, test_img)
        cv2.imwrite(test_tgt, test_img)

        # This triggers model downloads on first run
        try:
            swapper.swap_face(
                source_paths=[test_src],
                target_path=test_tgt,
                provider=DeviceProvider.CPU,
                detector_score=0.1,
            )
        except Exception:
            pass  # Expected to fail on dummy images, but models are now cached

        # Cleanup
        import shutil
        shutil.rmtree(test_dir, ignore_errors=True)
    except Exception as e:
        _log(f"[face_swap] Warmup model trigger: {e}")

    elapsed = round(time.time() - start, 1)
    _log(f"[face_swap] Warmup complete in {elapsed}s")


def swap_faces(user_photo_path: str, scenario_image_path: str) -> np.ndarray | None:
    """
    Swap face from user_photo into scenario_image using FaceFusion.
    Returns the swapped image as numpy array, or None if swap fails.
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

        result = swapper.swap_face(
            source_paths=[user_photo_path],
            target_path=scenario_image_path,
            provider=provider,
            detector_score=0.5,
            mask_blur=0.5,
            landmarker_score=0.5,
        )

        swap_elapsed = round(_time.time() - t_swap, 2)
        _log(f"[swap_faces] FaceFusion returned: type={type(result).__name__} ({swap_elapsed}s)")

        # Handle result — could be numpy array, file path, or other
        if result is None:
            _log("[swap_faces] RETURN_NONE reason=swap_returned_none")
            return None

        if isinstance(result, np.ndarray):
            _log(f"[swap_faces] OK result is ndarray shape={result.shape}")
            return result

        if isinstance(result, str) and os.path.exists(result):
            _log(f"[swap_faces] OK result is file path: {result}")
            img = cv2.imread(result)
            if img is not None:
                return img
            _log("[swap_faces] RETURN_NONE reason=could_not_read_result_file")
            return None

        # Try converting to string path
        result_str = str(result)
        if os.path.exists(result_str):
            img = cv2.imread(result_str)
            if img is not None:
                _log(f"[swap_faces] OK result converted to path: {result_str}")
                return img

        _log(f"[swap_faces] RETURN_NONE reason=unknown_result_type value={result_str[:200]}")
        return None

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
