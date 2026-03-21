#!/usr/bin/env python3
"""
Standalone face-swap validation test.
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
    import insightface
    INSIGHTFACE_OK = True
except ImportError as e:
    INSIGHTFACE_OK = False
    print(f"ERROR: insightface not installed: {e}")
    sys.exit(1)


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

    print("[3/6] Initializing InsightFace model (inswapper_128.onnx)...")
    try:
        model = insightface.model_zoo.get_model("inswapper_128.onnx")
        print("  ✓ Model loaded")
    except Exception as e:
        print(f"ERROR: Could not load inswapper model: {e}")
        return False

    print("[4/6] Initializing FaceAnalysis (buffalo_l)...")
    try:
        app = insightface.app.FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"]  # CPU only for validation
        )
        app.prepare(ctx_id=-1, det_size=(640, 640))  # ctx_id=-1 for CPU
        print("  ✓ FaceAnalysis initialized")
    except Exception as e:
        print(f"ERROR: Could not initialize FaceAnalysis: {e}")
        return False

    print("[5/6] Detecting faces...")
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

    print("[6/6] Swapping faces...")
    try:
        user_face = user_faces[0]
        swapped = scenario_img.copy()

        for i, scenario_face in enumerate(scenario_faces):
            print(f"  • Swapping face {i+1}/{len(scenario_faces)}...")
            swapped = model.get(swapped, scenario_face, user_face, paste_back=True)

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
    print("Face-Swap Standalone Test")
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
