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

    # 1. Preload FaceAnalysis (downloads buffalo_l on first run)
    print("[face_swap] Warming up FaceAnalysis (buffalo_l)...", flush=True)
    providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
    _face_app = FaceAnalysis(name="buffalo_l", providers=providers)
    try:
        _face_app.prepare(ctx_id=0, det_size=(640, 640))
        print("[face_swap] FaceAnalysis using GPU (ctx_id=0)", flush=True)
    except Exception:
        _face_app.prepare(ctx_id=-1, det_size=(640, 640))
        print("[face_swap] FaceAnalysis using CPU (ctx_id=-1)", flush=True)

    # 2. Preload inswapper ONNX model
    print("[face_swap] Warming up inswapper model...", flush=True)
    _inswapper_session = _get_inswapper_session()
    if _inswapper_session:
        active = _inswapper_session.get_providers()
        print(f"[face_swap] Inswapper active providers: {active}", flush=True)
    else:
        print("[face_swap] WARNING: inswapper session failed to load", flush=True)

    elapsed = round(time.time() - start, 1)
    print(f"[face_swap] Warmup complete in {elapsed}s", flush=True)


def _get_inswapper_session():
    """
    Get ONNX Runtime session for inswapper model.
    Handles model download on first use.
    """
    try:
        model_path = os.path.expanduser("~/.insightface/models/inswapper_128.onnx")

        if not os.path.exists(model_path):
            print("[face_swap] Downloading inswapper model...", flush=True)
            import insightface.model_zoo
            try:
                insightface.model_zoo.get_model("inswapper_128.onnx", download=True)
            except:
                pass

        # Log available providers before session creation
        available = ort.get_available_providers()
        print(f"[face_swap] inswapper: available providers = {available}", flush=True)

        sess_opts = ort.SessionOptions()

        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']

        # Try CUDA first; log the exact error if it fails
        try:
            session = ort.InferenceSession(
                model_path, sess_options=sess_opts, providers=providers
            )
            active = session.get_providers()
            print(f"[face_swap] inswapper: active providers = {active}", flush=True)
            if 'CUDAExecutionProvider' in active:
                return session
            print("[face_swap] inswapper: CUDA requested but not active, trying explicit CUDA-only...", flush=True)
        except Exception as e:
            print(f"[face_swap] inswapper: dual-provider init failed: {e}", flush=True)

        # Try CUDA-only to surface the exact error
        try:
            session = ort.InferenceSession(
                model_path, sess_options=sess_opts,
                providers=['CUDAExecutionProvider']
            )
            print(f"[face_swap] inswapper: CUDA-only succeeded: {session.get_providers()}", flush=True)
            return session
        except Exception as cuda_err:
            print(f"[face_swap] inswapper: CUDA-only FAILED: {cuda_err}", flush=True)

        # Fall back to CPU
        print("[face_swap] inswapper: falling back to CPU", flush=True)
        session = ort.InferenceSession(
            model_path, sess_options=sess_opts,
            providers=['CPUExecutionProvider']
        )
        return session
    except Exception as e:
        print(f"[face_swap] Error creating inswapper session: {e}", flush=True)
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

        inswapper_session = _inswapper_session
        user_face = user_faces[0]
        _log(f"[swap_faces] user_face embedding={user_face.embedding.shape} kps={user_face.kps.shape}")

        # Log model input/output names for diagnosis
        model_inputs = [(inp.name, inp.shape, inp.type) for inp in inswapper_session.get_inputs()]
        model_outputs = [(out.name, out.shape, out.type) for out in inswapper_session.get_outputs()]
        _log(f"[swap_faces] model inputs={model_inputs}")
        _log(f"[swap_faces] model outputs={model_outputs}")

        swapped = scenario_img.copy()

        for face_idx, scenario_face in enumerate(scenario_faces):
            try:
                # Step 3: Align
                t3 = _time.time()
                aimg = face_align.norm_crop(scenario_img, scenario_face.kps)
                _log(f"[swap_faces] OK step=align face={face_idx}: shape={aimg.shape} ({round(_time.time()-t3,3)}s)")

                # Step 4: Prepare blob
                blob = cv2.dnn.blobFromImage(
                    aimg, 1.0 / 255, (128, 128), swapRB=False
                )
                _log(f"[swap_faces] OK step=blob face={face_idx}: shape={blob.shape} dtype={blob.dtype}")

                # Step 5: ONNX inference
                t5 = _time.time()
                input_dict = {
                    'target': blob,
                    'source': user_face.embedding.reshape(1, 512)
                }
                output_name = inswapper_session.get_outputs()[0].name
                _log(f"[swap_faces] step=inference face={face_idx}: target={blob.shape} source={user_face.embedding.reshape(1,512).shape}")

                output = inswapper_session.run([output_name], input_dict)
                swapped_face = output[0][0]
                t5_elapsed = round(_time.time()-t5, 2)
                _log(f"[swap_faces] OK step=inference face={face_idx}: out={swapped_face.shape} min={swapped_face.min():.3f} max={swapped_face.max():.3f} ({t5_elapsed}s)")

                # Step 6: Post-process and paste back
                t6 = _time.time()
                swapped_face_uint8 = np.clip(swapped_face * 255, 0, 255).astype(np.uint8)
                swapped_face_resized = cv2.resize(
                    swapped_face_uint8.transpose(1, 2, 0),
                    (aimg.shape[1], aimg.shape[0])
                )

                mat = face_align.estimate_norm(scenario_face.kps)
                if mat is None:
                    _log(f"[swap_faces] WARN face={face_idx}: estimate_norm=None, skipping")
                    continue

                mat_inv = cv2.invertAffineTransform(mat)
                pasted = cv2.warpAffine(
                    swapped_face_resized, mat_inv,
                    (swapped.shape[1], swapped.shape[0]),
                    borderMode=cv2.BORDER_REFLECT
                )
                mask = np.zeros((swapped_face_resized.shape[0], swapped_face_resized.shape[1]), dtype=np.float32)
                mask = cv2.circle(mask, (mask.shape[1]//2, mask.shape[0]//2), mask.shape[0]//2, 1.0, -1)
                mask = cv2.GaussianBlur(mask, (21, 21), 0)
                mask_warped = cv2.warpAffine(
                    mask, mat_inv,
                    (swapped.shape[1], swapped.shape[0]),
                    borderMode=cv2.BORDER_CONSTANT
                )
                for c in range(3):
                    swapped[:, :, c] = (
                        swapped[:, :, c] * (1 - mask_warped) +
                        pasted[:, :, c] * mask_warped
                    )
                t6_elapsed = round(_time.time()-t6, 3)
                _log(f"[swap_faces] OK step=paste face={face_idx}: ({t6_elapsed}s)")

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
