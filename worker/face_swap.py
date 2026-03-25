#!/usr/bin/env python3
"""
Face-swap module using InsightFace inswapper model.
Downloads user photo and scenario image, swaps faces, uploads result.
"""

import os
import uuid
import tempfile
import cv2
import numpy as np
from storage import download_from_url, upload_to_uploads

try:
    import insightface
    from insightface.app import FaceAnalysis
    from insightface.model_zoo import get_model as get_insightface_model
    from insightface.utils import face_align
    import onnxruntime as ort
    INSIGHTFACE_AVAILABLE = True
    print(f"[face_swap] onnxruntime version={ort.__version__}", flush=True)
    print(f"[face_swap] Available providers: {ort.get_available_providers()}", flush=True)
except ImportError as e:
    INSIGHTFACE_AVAILABLE = False
    print(f"Warning: insightface dependencies not fully available: {e}", flush=True)

# Module-level caches — loaded once at startup via warmup()
_face_app = None
_inswapper_session = None


def warmup():
    """Preload models at startup so first request is fast."""
    global _face_app, _inswapper_session

    if not INSIGHTFACE_AVAILABLE:
        print("[face_swap] Cannot warmup: insightface not available", flush=True)
        return

    import time
    start = time.time()

    # 1. Preload FaceAnalysis (models pre-downloaded in Docker image)
    print("[face_swap] Warming up FaceAnalysis (buffalo_l)...", flush=True)
    providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
    _face_app = FaceAnalysis(name="buffalo_l", root="/root/.insightface", providers=providers)
    try:
        _face_app.prepare(ctx_id=0, det_size=(640, 640))
        print("[face_swap] FaceAnalysis using GPU (ctx_id=0)", flush=True)
    except Exception:
        _face_app.prepare(ctx_id=-1, det_size=(640, 640))
        print("[face_swap] FaceAnalysis using CPU (ctx_id=-1)", flush=True)

    # 2. Preload inswapper model (pre-downloaded in Docker image)
    print("[face_swap] Warming up inswapper model...", flush=True)
    _inswapper_session = _load_inswapper()
    if _inswapper_session:
        print(f"[face_swap] Inswapper loaded: {type(_inswapper_session).__name__}", flush=True)
    else:
        print("[face_swap] WARNING: inswapper failed to load", flush=True)

    elapsed = round(time.time() - start, 1)
    print(f"[face_swap] Warmup complete in {elapsed}s", flush=True)


def _load_inswapper():
    """Load inswapper model from pre-downloaded path using insightface's get_model."""
    model_path = "/root/.insightface/models/inswapper_128.onnx"
    try:
        if not os.path.exists(model_path):
            print(f"[face_swap] inswapper model NOT FOUND at {model_path}", flush=True)
            return None

        file_size = os.path.getsize(model_path)
        print(f"[face_swap] inswapper model found: {model_path} ({file_size} bytes)", flush=True)

        available = ort.get_available_providers()
        print(f"[face_swap] inswapper: available providers = {available}", flush=True)

        # Use insightface's get_model for proper initialization
        swapper = get_insightface_model(model_path, download=False)
        print(f"[face_swap] inswapper loaded via get_model: {type(swapper).__name__}", flush=True)
        return swapper
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[face_swap] inswapper load FAILED: {e}\n{tb}", flush=True)
        return None


def swap_faces(user_photo_path: str, scenario_image_path: str) -> np.ndarray | None:
    """
    Swap the face from user_photo into scenario_image using InsightFace inswapper.
    Returns the swapped image as numpy array, or None if swap fails.

    Correct pipeline:
    1. Detect faces in both images
    2. Load inswapper ONNX model
    3. For each scenario face: align, run inference, paste back
    4. Return blended result
    """
    _log(f"[swap_faces] ENTER user={user_photo_path} scenario={scenario_image_path}")

    if not INSIGHTFACE_AVAILABLE:
        _log("[swap_faces] RETURN_NONE reason=insightface_not_available")
        return None

    import time as _time
    try:
        # Use preloaded models (fall back to lazy init if warmup didn't run)
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
            _log(f"[swap_faces] RETURN_NONE reason=user_img_decode_failed path={user_photo_path} exists={os.path.exists(user_photo_path)} size={os.path.getsize(user_photo_path) if os.path.exists(user_photo_path) else 'N/A'}")
            return None
        if scenario_img is None:
            _log(f"[swap_faces] RETURN_NONE reason=scenario_img_decode_failed path={scenario_image_path} exists={os.path.exists(scenario_image_path)} size={os.path.getsize(scenario_image_path) if os.path.exists(scenario_image_path) else 'N/A'}")
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
        _log(f"[swap_faces] user_face embedding={user_face.embedding.shape} kps={user_face.kps.shape}")
        _log(f"[swap_faces] swapper type={type(swapper).__name__}")

        swapped = scenario_img.copy()

        for face_idx, scenario_face in enumerate(scenario_faces):
            try:
                # Use insightface's built-in swap — handles align, inference, paste-back
                t_swap = _time.time()
                swapped = swapper.get(swapped, scenario_face, user_face, paste_back=True)
                elapsed = round(_time.time() - t_swap, 2)
                _log(f"[swap_faces] OK step=swap face={face_idx}: ({elapsed}s)")

            except Exception as e:
                import traceback
                tb = traceback.format_exc()
                _log(f"[swap_faces] FAIL face={face_idx}: {e}\n{tb}")
                continue

        _log(f"[swap_faces] OK step=complete: output={swapped.shape}")
        return swapped

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        _log(f"[swap_faces] RETURN_NONE reason=exception error={e}\n{tb}")
        return None


def _log(msg: str):
    """Guaranteed log line with forced flush on both stdout and stderr."""
    import sys
    print(msg, flush=True)
    sys.stdout.flush()
    sys.stderr.flush()


def do_face_swap(user_photo_url: str, scenario_image_url: str) -> str | None:
    """
    Download images, swap faces, upload result, return public URL.
    """
    import time as _time
    _log(f"[do_face_swap] ENTER user_url={user_photo_url[:80]} scenario_url={scenario_image_url[:80]}")
    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            # Download images
            user_photo_path = os.path.join(tmpdir, "user.jpg")
            scenario_path = os.path.join(tmpdir, "scenario.jpg")

            if not download_from_url(user_photo_url, user_photo_path):
                _log("[do_face_swap] RETURN_NONE reason=download_user_failed")
                return None
            user_size = os.path.getsize(user_photo_path)
            _log(f"[do_face_swap] OK step=download_user: {user_size} bytes")

            if not download_from_url(scenario_image_url, scenario_path):
                _log("[do_face_swap] RETURN_NONE reason=download_scenario_failed")
                return None
            scenario_size = os.path.getsize(scenario_path)
            _log(f"[do_face_swap] OK step=download_scenario: {scenario_size} bytes")

            # Swap faces
            t_swap = _time.time()
            swapped_array = swap_faces(user_photo_path, scenario_path)
            swap_elapsed = round(_time.time() - t_swap, 2)
            if swapped_array is None:
                _log(f"[do_face_swap] RETURN_NONE reason=swap_faces_returned_none elapsed={swap_elapsed}s")
                return None
            _log(f"[do_face_swap] OK step=swap_faces: shape={swapped_array.shape} ({swap_elapsed}s)")

            # Save swapped image
            swapped_path = os.path.join(tmpdir, "swapped.jpg")
            success = cv2.imwrite(swapped_path, swapped_array)
            if not success:
                _log("[do_face_swap] RETURN_NONE reason=imwrite_failed")
                return None
            saved_size = os.path.getsize(swapped_path)
            _log(f"[do_face_swap] OK step=save: {saved_size} bytes")

            # Upload to Supabase
            storage_path = f"preview-faceswaps/{str(uuid.uuid4())}.jpg"
            t_upload = _time.time()
            result_url = upload_to_uploads(swapped_path, storage_path)
            upload_elapsed = round(_time.time() - t_upload, 2)
            if not result_url:
                _log(f"[do_face_swap] RETURN_NONE reason=upload_returned_none elapsed={upload_elapsed}s")
                return None
            _log(f"[do_face_swap] OK step=upload: {result_url} ({upload_elapsed}s)")

            return result_url
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            _log(f"[do_face_swap] RETURN_NONE reason=exception error={e}\n{tb}")
            return None


# For testing locally
if __name__ == "__main__":
    import uuid
    user_url = "https://example.com/user.jpg"
    scenario_url = "https://example.com/scenario.jpg"
    result = do_face_swap(user_url, scenario_url)
    print(f"Result: {result}")
