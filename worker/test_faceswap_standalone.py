#!/usr/bin/env python3
"""
Standalone face-swap validation test (FIXED VERSION).
Does NOT require Supabase, Flask, or the full app.
Tests the core face-swap logic only.

Usage:
  python test_faceswap_standalone.py <user_photo_path> <scenario_image_path> <output_path>

Example:
  python test_faceswap_standalone.py user.jpg scenario.jpg output.jpg
"""

import sys
import os
import cv2
import numpy as np

try:
    from insightface.app import FaceAnalysis
    from insightface.utils import face_align
    import onnxruntime as ort
    INSIGHTFACE_OK = True
except ImportError as e:
    INSIGHTFACE_OK = False
    print(f"ERROR: insightface dependencies not installed: {e}")
    sys.exit(1)


def get_inswapper_session():
    """Get ONNX Runtime session for inswapper model."""
    try:
        model_path = os.path.expanduser("~/.insightface/models/inswapper_128.onnx")

        # If model doesn't exist, trigger download
        if not os.path.exists(model_path):
            print("Downloading inswapper model...")
            import insightface.model_zoo
            try:
                insightface.model_zoo.get_model("inswapper_128.onnx", download=True)
            except:
                pass

        # Create ONNX Runtime session
        sess_opts = ort.SessionOptions()
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
        session = ort.InferenceSession(model_path, sess_options=sess_opts, providers=['CPUExecutionProvider'])
        return session
    except Exception as e:
        print(f"ERROR: Could not create inswapper session: {e}")
        return None


def swap_faces_standalone(user_photo_path: str, scenario_image_path: str, output_path: str) -> bool:
    """
    Swap the face from user_photo into scenario_image.
    Save result to output_path.
    Returns True if successful, False otherwise.
    """
    print(f"[1/6] Loading user photo: {user_photo_path}")
    user_img = cv2.imread(user_photo_path)
    if user_img is None:
        print(f"ERROR: Could not read user photo from {user_photo_path}")
        return False
    print(f"  ✓ Loaded {user_img.shape}")

    print(f"[2/6] Loading scenario image: {scenario_image_path}")
    scenario_img = cv2.imread(scenario_image_path)
    if scenario_img is None:
        print(f"ERROR: Could not read scenario image from {scenario_image_path}")
        return False
    print(f"  ✓ Loaded {scenario_img.shape}")

    print("[3/6] Initializing FaceAnalysis (buffalo_l)...")
    try:
        app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
        app.prepare(ctx_id=-1, det_size=(640, 640))
        print("  ✓ FaceAnalysis initialized")
    except Exception as e:
        print(f"ERROR: Could not initialize FaceAnalysis: {e}")
        return False

    print("[4/6] Detecting faces...")
    try:
        user_faces = app.get(user_img)
        scenario_faces = app.get(scenario_img)

        print(f"  ✓ Found {len(user_faces)} face(s) in user photo")
        print(f"  ✓ Found {len(scenario_faces)} face(s) in scenario image")

        if not user_faces:
            print("ERROR: No face detected in user photo")
            return False
        if not scenario_faces:
            print("ERROR: No face detected in scenario image")
            return False
    except Exception as e:
        print(f"ERROR: Face detection failed: {e}")
        return False

    print("[5/6] Loading inswapper model...")
    inswapper_session = get_inswapper_session()
    if inswapper_session is None:
        print("ERROR: Could not load inswapper model")
        return False
    print("  ✓ Inswapper model loaded")

    print("[6/6] Swapping faces...")
    try:
        user_face = user_faces[0]
        swapped = scenario_img.copy()

        for i, scenario_face in enumerate(scenario_faces):
            print(f"  • Swapping face {i+1}/{len(scenario_faces)}...")

            # Step 1: Align scenario face
            aimg = face_align.norm_crop(scenario_img, scenario_face.kps)

            # Step 2: Prepare input for ONNX model
            blob = cv2.dnn.blobFromImage(aimg, 1.0 / 255, (128, 128), swapRB=False)

            # Step 3: Run ONNX inference
            input_name = inswapper_session.get_inputs()[0].name
            output_name = inswapper_session.get_outputs()[0].name

            input_dict = {
                'target': blob,
                'source': user_face.embedding.reshape(1, 512)
            }

            output = inswapper_session.run([output_name], input_dict)
            swapped_face = output[0][0]

            # Step 4: Paste swapped face back into original image
            swapped_face_uint8 = np.clip(swapped_face * 255, 0, 255).astype(np.uint8)
            swapped_face_resized = cv2.resize(
                swapped_face_uint8.transpose(1, 2, 0),
                (aimg.shape[1], aimg.shape[0])
            )

            mat = face_align.estimate_norm(scenario_face.kps)
            if mat is not None:
                mat_inv = cv2.invertAffineTransform(mat)

                pasted = cv2.warpAffine(
                    swapped_face_resized,
                    mat_inv,
                    (swapped.shape[1], swapped.shape[0]),
                    borderMode=cv2.BORDER_REFLECT
                )

                # Alpha blend
                mask = np.zeros((swapped_face_resized.shape[0], swapped_face_resized.shape[1]), dtype=np.float32)
                mask = cv2.circle(mask, (mask.shape[1]//2, mask.shape[0]//2), mask.shape[0]//2, 1.0, -1)
                mask = cv2.GaussianBlur(mask, (21, 21), 0)

                mask_warped = cv2.warpAffine(mask, mat_inv, (swapped.shape[1], swapped.shape[0]), borderMode=cv2.BORDER_CONSTANT)

                for c in range(3):
                    swapped[:, :, c] = (
                        swapped[:, :, c] * (1 - mask_warped) +
                        pasted[:, :, c] * mask_warped
                    )

        # Save result
        success = cv2.imwrite(output_path, swapped)
        if not success:
            print(f"ERROR: Could not write output to {output_path}")
            return False

        file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
        print(f"  ✓ Swap successful: {output_path} ({file_size_mb:.2f} MB)")
        return True

    except Exception as e:
        print(f"ERROR: Face swap failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python test_faceswap_standalone.py <user_photo> <scenario_image> <output_path>")
        print("\nExample:")
        print("  python test_faceswap_standalone.py user.jpg scenario.jpg output.jpg")
        sys.exit(1)

    user_photo = sys.argv[1]
    scenario_image = sys.argv[2]
    output_path = sys.argv[3]

    if not os.path.exists(user_photo):
        print(f"ERROR: User photo not found: {user_photo}")
        sys.exit(1)

    if not os.path.exists(scenario_image):
        print(f"ERROR: Scenario image not found: {scenario_image}")
        sys.exit(1)

    print("=" * 60)
    print("Face-Swap Standalone Test (Fixed)")
    print("=" * 60)
    print()

    success = swap_faces_standalone(user_photo, scenario_image, output_path)

    print()
    if success:
        print("=" * 60)
        print("✓ SUCCESS: Face swap completed")
        print("=" * 60)
        sys.exit(0)
    else:
        print("=" * 60)
        print("✗ FAILED: Face swap did not complete")
        print("=" * 60)
        sys.exit(1)
