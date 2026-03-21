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
except ImportError as e:
    INSIGHTFACE_AVAILABLE = False
    print(f"Warning: insightface dependencies not fully available: {e}")


def _get_inswapper_session():
    """
    Get ONNX Runtime session for inswapper model.
    Handles model download on first use.
    """
    try:
        # Ensure model is downloaded
        model_path = os.path.expanduser("~/.insightface/models/inswapper_128.onnx")

        # If model doesn't exist, trigger download via FaceAnalysis initialization
        if not os.path.exists(model_path):
            print("Downloading inswapper model...")
            import insightface.model_zoo
            try:
                insightface.model_zoo.get_model("inswapper_128.onnx", download=True)
            except:
                pass  # Fallback: model may download during first swap attempt

        # Create ONNX Runtime session
        sess_opts = ort.SessionOptions()
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL

        # Use GPU provider with CPU fallback (Phase 2: GPU support)
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
        session = ort.InferenceSession(model_path, sess_options=sess_opts, providers=providers)
        return session
    except Exception as e:
        print(f"Error creating inswapper session: {e}")
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
        # Read images
        user_img = cv2.imread(user_photo_path)
        scenario_img = cv2.imread(scenario_image_path)

        if user_img is None or scenario_img is None:
            print("Error: Could not read input images")
            return None

        # Initialize FaceAnalysis for detection with GPU support (Phase 2)
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
        app = FaceAnalysis(
            name="buffalo_l",
            providers=providers
        )
        # Try GPU first (ctx_id=0), fall back to CPU (ctx_id=-1) if unavailable
        try:
            app.prepare(ctx_id=0, det_size=(640, 640))
        except Exception:
            app.prepare(ctx_id=-1, det_size=(640, 640))

        # Detect faces
        user_faces = app.get(user_img)
        scenario_faces = app.get(scenario_img)

        if not user_faces:
            print("Error: No face detected in user photo")
            return None
        if not scenario_faces:
            print("Error: No face detected in scenario image")
            return None

        # Get inswapper ONNX session
        inswapper_session = _get_inswapper_session()
        if inswapper_session is None:
            print("Error: Could not load inswapper model")
            return None

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
