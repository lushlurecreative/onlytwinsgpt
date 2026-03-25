#!/usr/bin/env python3
"""
Face-swap module using InsightFace inswapper + GFPGAN face restoration.
Downloads user photo and scenario image, swaps faces, enhances quality, returns base64.
"""

import os
import base64
import tempfile
import cv2
import numpy as np
from storage import download_from_url

try:
    import insightface
    from insightface.app import FaceAnalysis
    from insightface.model_zoo import get_model as get_insightface_model
    import onnxruntime as ort
    INSIGHTFACE_AVAILABLE = True
    print(f"[face_swap] onnxruntime version={ort.__version__}", flush=True)
    print(f"[face_swap] Available providers: {ort.get_available_providers()}", flush=True)
except ImportError as e:
    INSIGHTFACE_AVAILABLE = False
    print(f"Warning: insightface dependencies not fully available: {e}", flush=True)

try:
    from gfpgan import GFPGANer
    GFPGAN_AVAILABLE = True
    print("[face_swap] GFPGAN available", flush=True)
except ImportError as e:
    GFPGAN_AVAILABLE = False
    print(f"[face_swap] GFPGAN not available: {e}", flush=True)

# Module-level caches — loaded once at startup via warmup()
_face_app = None
_inswapper_session = None
_gfpgan_enhancer = None


def warmup():
    """Preload models at startup so first request is fast."""
    global _face_app, _inswapper_session, _gfpgan_enhancer

    if not INSIGHTFACE_AVAILABLE:
        print("[face_swap] Cannot warmup: insightface not available", flush=True)
        return

    import time
    start = time.time()

    # 1. Preload FaceAnalysis
    print("[face_swap] Warming up FaceAnalysis (buffalo_l)...", flush=True)
    providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
    _face_app = FaceAnalysis(name="buffalo_l", root="/root/.insightface", providers=providers)
    try:
        _face_app.prepare(ctx_id=0, det_size=(640, 640))
        print("[face_swap] FaceAnalysis using GPU (ctx_id=0)", flush=True)
    except Exception:
        _face_app.prepare(ctx_id=-1, det_size=(640, 640))
        print("[face_swap] FaceAnalysis using CPU (ctx_id=-1)", flush=True)

    # 2. Preload inswapper model
    print("[face_swap] Warming up inswapper model...", flush=True)
    _inswapper_session = _load_inswapper()
    if _inswapper_session:
        print(f"[face_swap] Inswapper loaded: {type(_inswapper_session).__name__}", flush=True)
    else:
        print("[face_swap] WARNING: inswapper failed to load", flush=True)

    # 3. Preload GFPGAN face enhancer
    if GFPGAN_AVAILABLE:
        print("[face_swap] Warming up GFPGAN...", flush=True)
        try:
            _gfpgan_enhancer = GFPGANer(
                model_path="/root/.insightface/models/GFPGANv1.4.pth",
                upscale=1,  # Don't upscale, just enhance at original resolution
                arch="clean",
                channel_multiplier=2,
                bg_upsampler=None,
                device="cuda",
            )
            print("[face_swap] GFPGAN loaded successfully", flush=True)
        except Exception as e:
            import traceback
            print(f"[face_swap] GFPGAN load failed: {e}\n{traceback.format_exc()}", flush=True)
            _gfpgan_enhancer = None
    else:
        print("[face_swap] Skipping GFPGAN warmup (not installed)", flush=True)

    elapsed = round(time.time() - start, 1)
    print(f"[face_swap] Warmup complete in {elapsed}s", flush=True)


def _load_inswapper():
    """Load inswapper model from pre-downloaded path."""
    model_path = "/root/.insightface/models/inswapper_128.onnx"
    try:
        if not os.path.exists(model_path):
            print(f"[face_swap] inswapper model NOT FOUND at {model_path}", flush=True)
            return None

        file_size = os.path.getsize(model_path)
        print(f"[face_swap] inswapper model found: {model_path} ({file_size} bytes)", flush=True)

        swapper = get_insightface_model(model_path, download=False)
        print(f"[face_swap] inswapper loaded via get_model: {type(swapper).__name__}", flush=True)
        return swapper
    except Exception as e:
        import traceback
        print(f"[face_swap] inswapper load FAILED: {e}\n{traceback.format_exc()}", flush=True)
        return None


def _enhance_face(image: np.ndarray) -> np.ndarray:
    """Apply GFPGAN face restoration for better quality."""
    global _gfpgan_enhancer
    if _gfpgan_enhancer is None:
        return image

    try:
        import time as _time
        t0 = _time.time()
        _, _, enhanced = _gfpgan_enhancer.enhance(
            image,
            has_aligned=False,
            only_center_face=False,
            paste_back=True,
            weight=0.7,  # 0.7 = blend 70% enhanced + 30% original for natural look
        )
        elapsed = round(_time.time() - t0, 2)
        _log(f"[enhance] GFPGAN complete in {elapsed}s, shape={enhanced.shape}")
        return enhanced
    except Exception as e:
        _log(f"[enhance] GFPGAN failed, returning unenhanced: {e}")
        return image


def swap_faces(user_photo_path: str, scenario_image_path: str) -> np.ndarray | None:
    """
    Swap face from user_photo into scenario_image, then enhance with GFPGAN.
    Returns the enhanced swapped image as numpy array, or None if swap fails.
    """
    _log(f"[swap_faces] ENTER user={user_photo_path} scenario={scenario_image_path}")

    if not INSIGHTFACE_AVAILABLE:
        _log("[swap_faces] RETURN_NONE reason=insightface_not_available")
        return None

    import time as _time
    try:
        global _face_app, _inswapper_session
        if _face_app is None or _inswapper_session is None:
            _log("[swap_faces] Models not preloaded, loading now...")
            warmup()

        if _face_app is None or _inswapper_session is None:
            _log("[swap_faces] RETURN_NONE reason=models_failed_to_load")
            return None

        # Step 1: Decode images
        t0 = _time.time()
        user_img = cv2.imread(user_photo_path)
        scenario_img = cv2.imread(scenario_image_path)

        if user_img is None:
            _log(f"[swap_faces] RETURN_NONE reason=user_img_decode_failed")
            return None
        if scenario_img is None:
            _log(f"[swap_faces] RETURN_NONE reason=scenario_img_decode_failed")
            return None
        _log(f"[swap_faces] OK step=decode: user={user_img.shape} scenario={scenario_img.shape} ({round(_time.time()-t0,2)}s)")

        # Step 2: Detect faces
        t1 = _time.time()
        user_faces = _face_app.get(user_img)
        t_user_detect = round(_time.time()-t1, 2)

        t2 = _time.time()
        scenario_faces = _face_app.get(scenario_img)
        t_scenario_detect = round(_time.time()-t2, 2)

        if not user_faces:
            _log(f"[swap_faces] RETURN_NONE reason=no_user_face detect_time={t_user_detect}s")
            return None
        if not scenario_faces:
            _log(f"[swap_faces] RETURN_NONE reason=no_scenario_face detect_time={t_scenario_detect}s")
            return None
        _log(f"[swap_faces] OK step=detect: user_faces={len(user_faces)} ({t_user_detect}s) scenario_faces={len(scenario_faces)} ({t_scenario_detect}s)")

        swapper = _inswapper_session
        user_face = user_faces[0]

        swapped = scenario_img.copy()

        for face_idx, scenario_face in enumerate(scenario_faces):
            try:
                t_swap = _time.time()
                swapped = swapper.get(swapped, scenario_face, user_face, paste_back=True)
                elapsed = round(_time.time() - t_swap, 2)
                _log(f"[swap_faces] OK step=swap face={face_idx}: ({elapsed}s)")
            except Exception as e:
                import traceback
                _log(f"[swap_faces] FAIL face={face_idx}: {e}\n{traceback.format_exc()}")
                continue

        _log(f"[swap_faces] OK step=swap_complete: output={swapped.shape}")

        # Step 3: Enhance with GFPGAN
        enhanced = _enhance_face(swapped)
        _log(f"[swap_faces] OK step=complete: output={enhanced.shape}")
        return enhanced

    except Exception as e:
        import traceback
        _log(f"[swap_faces] RETURN_NONE reason=exception error={e}\n{traceback.format_exc()}")
        return None


def _log(msg: str):
    """Guaranteed log line with forced flush."""
    import sys
    print(msg, flush=True)
    sys.stdout.flush()
    sys.stderr.flush()


def do_face_swap(user_photo_url: str, scenario_image_url: str) -> str | None:
    """
    Download images, swap faces, enhance, return base64-encoded JPEG.
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
