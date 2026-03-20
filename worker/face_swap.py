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
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    INSIGHTFACE_AVAILABLE = False
    print("Warning: insightface not installed. Face swap will fail.")


def swap_faces(user_photo_path: str, scenario_image_path: str) -> np.ndarray | None:
    """
    Swap the face from user_photo into scenario_image using InsightFace inswapper.
    Returns the swapped image as numpy array, or None if swap fails.
    """
    if not INSIGHTFACE_AVAILABLE:
        print("Error: insightface not available")
        return None

    try:
        # Initialize inswapper model (downloads automatically on first use)
        model = insightface.model_zoo.get_model("inswapper_128.onnx")

        # Read images
        user_img = cv2.imread(user_photo_path)
        scenario_img = cv2.imread(scenario_image_path)

        if user_img is None or scenario_img is None:
            print("Error: Could not read input images")
            return None

        # Prepare
        app = insightface.app.FaceAnalysis(
            name="buffalo_l",
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
        )
        app.prepare(ctx_id=0, det_size=(640, 640))

        # Detect faces
        user_faces = app.get(user_img)
        scenario_faces = app.get(scenario_img)

        if not user_faces:
            print("Error: No face detected in user photo")
            return None
        if not scenario_faces:
            print("Error: No face detected in scenario image")
            return None

        # Swap: take first face from user, swap into all faces in scenario
        user_face = user_faces[0]
        swapped = scenario_img.copy()

        for scenario_face in scenario_faces:
            swapped = model.get(swapped, scenario_face, user_face, paste_back=True)

        return swapped
    except Exception as e:
        print(f"Face swap error: {e}")
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
