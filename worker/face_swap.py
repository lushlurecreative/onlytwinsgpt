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
    if not INSIGHTFACE_AVAILABLE:
        print("Error: insightface not available")
        return None

    try:
        # Use preloaded models (fall back to lazy init if warmup didn't run)
        global _face_app, _inswapper_session
        if _face_app is None or _inswapper_session is None:
            print("[face_swap] Models not preloaded, loading now...", flush=True)
            warmup()

        if _face_app is None or _inswapper_session is None:
            print("[face_swap] Error: models failed to load", flush=True)
            return None

        # Read images
        user_img = cv2.imread(user_photo_path)
        scenario_img = cv2.imread(scenario_image_path)

        if user_img is None or scenario_img is None:
            print("[face_swap] Error: Could not read input images", flush=True)
            return None

        # Detect faces using preloaded FaceAnalysis
        user_faces = _face_app.get(user_img)
        scenario_faces = _face_app.get(scenario_img)

        if not user_faces:
            print("[face_swap] Error: No face detected in user photo", flush=True)
            return None
        if not scenario_faces:
            print("[face_swap] Error: No face detected in scenario image", flush=True)
            return None

        inswapper_session = _inswapper_session

        # Prepare for swap: get user face embedding
        user_face = user_faces[0]

        # Swap each face in scenario with user face
        swapped = scenario_img.copy()

        for scenario_face in scenario_faces:
            try:
                # Step 1: Align scenario face (crop and normalize for model input)
                # Use face_align to crop the face region
                aimg = face_align.norm_crop(scenario_img, scenario_face.kps)

                # Step 2: Prepare input for ONNX model
                # Convert to float32 in range [0, 1] (or [-1, 1] depending on model training)
                blob = cv2.dnn.blobFromImage(
                    aimg,
                    1.0 / 255,  # Scale to [0, 1]
                    (128, 128),  # Model input size
                    swapRB=False
                )

                # Step 3: Run ONNX inference
                # Inputs: target (aligned face), source (user embedding)
                input_name = inswapper_session.get_inputs()[0].name
                output_name = inswapper_session.get_outputs()[0].name

                # Prepare inputs
                # The inswapper model expects:
                # - target: aligned face (1, 3, 128, 128) - the face being swapped into
                # - source: user face embedding - already extracted from user_face.embedding

                # Create proper input dict based on model signature
                input_dict = {
                    'target': blob,  # Aligned target face
                    'source': user_face.embedding.reshape(1, 512)  # User face embedding
                }

                # Run inference
                output = inswapper_session.run([output_name], input_dict)
                swapped_face = output[0][0]  # Get result

                # Step 4: Paste swapped face back into original image
                # Convert swapped_face back to uint8 in BGR format
                swapped_face_uint8 = np.clip(swapped_face * 255, 0, 255).astype(np.uint8)

                # Resize back to original aligned size
                swapped_face_resized = cv2.resize(
                    swapped_face_uint8.transpose(1, 2, 0),  # CHW -> HWC
                    (aimg.shape[1], aimg.shape[0])
                )

                # Get transformation matrix for this face
                # Create the affine transformation matrix (estimate from landmarks)
                mat = face_align.estimate_norm(scenario_face.kps)

                # Inverse transformation to paste back
                if mat is not None:
                    # Get inverse matrix
                    mat_inv = cv2.invertAffineTransform(mat)

                    # Warp swapped face back to original image space
                    pasted = cv2.warpAffine(
                        swapped_face_resized,
                        mat_inv,
                        (swapped.shape[1], swapped.shape[0]),
                        borderMode=cv2.BORDER_REFLECT
                    )

                    # Alpha blend to avoid harsh edges
                    # Create a mask for smooth blending
                    mask = np.zeros((swapped_face_resized.shape[0], swapped_face_resized.shape[1]), dtype=np.float32)
                    mask = cv2.circle(mask, (mask.shape[1]//2, mask.shape[0]//2), mask.shape[0]//2, 1.0, -1)
                    mask = cv2.GaussianBlur(mask, (21, 21), 0)

                    mask_warped = cv2.warpAffine(
                        mask,
                        mat_inv,
                        (swapped.shape[1], swapped.shape[0]),
                        borderMode=cv2.BORDER_CONSTANT
                    )

                    # Blend
                    for c in range(3):
                        swapped[:, :, c] = (
                            swapped[:, :, c] * (1 - mask_warped) +
                            pasted[:, :, c] * mask_warped
                        )

            except Exception as e:
                print(f"Error swapping individual face: {e}")
                import traceback
                traceback.print_exc()
                # Continue with next face if one fails
                continue

        return swapped

    except Exception as e:
        print(f"Face swap error: {e}")
        import traceback
        traceback.print_exc()
        return None


def do_face_swap(user_photo_url: str, scenario_image_url: str) -> str | None:
    """
    Download images, swap faces, upload result, return public URL.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            # Download images
            user_photo_path = os.path.join(tmpdir, "user.jpg")
            scenario_path = os.path.join(tmpdir, "scenario.jpg")

            if not download_from_url(user_photo_url, user_photo_path):
                print("Error: Could not download user photo")
                return None
            if not download_from_url(scenario_image_url, scenario_path):
                print("Error: Could not download scenario image")
                return None

            # Swap faces
            swapped_array = swap_faces(user_photo_path, scenario_path)
            if swapped_array is None:
                return None

            # Save swapped image
            swapped_path = os.path.join(tmpdir, "swapped.jpg")
            success = cv2.imwrite(swapped_path, swapped_array)
            if not success:
                print("Error: Could not save swapped image")
                return None

            # Upload to Supabase (temp bucket, accessible via public URL)
            result_url = upload_to_uploads(
                swapped_path,
                f"preview-faceswaps/{str(uuid.uuid4())}.jpg"
            )

            return result_url
        except Exception as e:
            print(f"do_face_swap error: {e}")
            return None


# For testing locally
if __name__ == "__main__":
    import uuid
    user_url = "https://example.com/user.jpg"
    scenario_url = "https://example.com/scenario.jpg"
    result = do_face_swap(user_url, scenario_url)
    print(f"Result: {result}")
