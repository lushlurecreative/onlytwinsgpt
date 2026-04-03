#!/usr/bin/env python3
"""
OnlyTwins 2-Step Pipeline: Generate scene with FLUX, then face-swap source identity.

Step 1: FLUX generates body/pose/scene image (NO identity — generic person)
Step 2: FaceFusion swaps the user's uploaded face onto the generated image

This gives pixel-level identity accuracy from the source photo.
"""

import os
import sys
import time
import tempfile

try:
    import cv2
except ImportError:
    cv2 = None

from face_swap import swap_faces, FACEFUSION_AVAILABLE


def _log(msg: str):
    print(msg, flush=True)
    sys.stdout.flush()


def generate_and_swap(
    source_face_path: str,
    prompt: str,
    output_path: str,
    negative_prompt: str = "",
    width: int = 1024,
    height: int = 1024,
    steps: int = 20,
    guidance: float = 3.5,
    seed: int = None,
    upscale: bool = False,
) -> str:
    """
    2-step pipeline:
      1. Generate base scene with FLUX (generic person, no identity)
      2. Face-swap source_face_path onto the generated scene

    Returns path to final output image.
    """
    t_total = time.time()

    if not os.path.isfile(source_face_path):
        raise FileNotFoundError(f"Source face not found: {source_face_path}")

    if not FACEFUSION_AVAILABLE:
        raise RuntimeError("FaceFusion not available — cannot do face swap step")

    # ── STEP 1: Generate base scene (no identity) ──────────────────────
    _log("[generate_swap] STEP 1: Generating base scene with FLUX...")
    t1 = time.time()

    scene_prompt = _ensure_generic_person(prompt)
    scene_negative = negative_prompt or (
        "blurry, deformed, ugly, bad anatomy, disfigured, "
        "poorly drawn face, mutation, extra limb, cartoon, anime"
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        base_image_path = os.path.join(tmpdir, "base_scene.png")

        from generate_flux import generate as flux_generate
        flux_generate(
            prompt=scene_prompt,
            negative_prompt=scene_negative,
            output_path=base_image_path,
            lora_path=None,
            width=width,
            height=height,
            num_inference_steps=steps,
            guidance_scale=guidance,
            seed=seed,
            upscale=upscale,
        )

        step1_elapsed = round(time.time() - t1, 1)
        _log(f"[generate_swap] STEP 1 complete ({step1_elapsed}s): {base_image_path}")

        if not os.path.isfile(base_image_path):
            raise RuntimeError("FLUX generation produced no output")

        # ── STEP 2: Face swap source identity onto generated scene ──────
        _log("[generate_swap] STEP 2: Swapping source face onto generated scene...")
        t2 = time.time()

        swapped = swap_faces(source_face_path, base_image_path)
        step2_elapsed = round(time.time() - t2, 1)

        if swapped is None:
            _log("[generate_swap] WARNING: Face swap returned None — using base image as fallback")
            import shutil
            shutil.copy2(base_image_path, output_path)
        else:
            _log(f"[generate_swap] STEP 2 complete ({step2_elapsed}s): swap shape={swapped.shape}")
            if cv2 is not None:
                cv2.imwrite(output_path, swapped, [cv2.IMWRITE_JPEG_QUALITY, 95])
            else:
                from PIL import Image
                rgb = swapped[:, :, ::-1]
                Image.fromarray(rgb).save(output_path, quality=95)

    total_elapsed = round(time.time() - t_total, 1)
    _log(f"[generate_swap] DONE ({total_elapsed}s): {output_path}")
    return output_path


def _ensure_generic_person(prompt: str) -> str:
    """If the prompt doesn't mention a person, prepend one."""
    lower = prompt.lower()
    person_words = ["person", "woman", "man", "model", "figure", "portrait", "girl", "boy", "lady"]
    if any(w in lower for w in person_words):
        return prompt
    return f"a person, {prompt}"


def generate_and_swap_from_urls(
    source_face_url: str,
    prompt: str,
    output_path: str,
    negative_prompt: str = "",
    width: int = 1024,
    height: int = 1024,
    steps: int = 20,
    guidance: float = 3.5,
    seed: int = None,
    upscale: bool = False,
) -> str:
    """Same as generate_and_swap but downloads the source face from a URL first."""
    from storage import download_from_url

    with tempfile.TemporaryDirectory() as tmpdir:
        face_path = os.path.join(tmpdir, "source_face.jpg")
        if not download_from_url(source_face_url, face_path):
            raise RuntimeError(f"Failed to download source face from: {source_face_url}")

        return generate_and_swap(
            source_face_path=face_path,
            prompt=prompt,
            output_path=output_path,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            steps=steps,
            guidance=guidance,
            seed=seed,
            upscale=upscale,
        )


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="2-step: FLUX scene + FaceFusion swap")
    p.add_argument("--face", required=True, help="Path to source face photo")
    p.add_argument("--prompt", required=True, help="Scene description")
    p.add_argument("--output", default="output_swap.jpg", help="Output file path")
    p.add_argument("--negative", default="", help="Negative prompt")
    p.add_argument("--width", type=int, default=1024)
    p.add_argument("--height", type=int, default=1024)
    p.add_argument("--steps", type=int, default=20)
    p.add_argument("--guidance", type=float, default=3.5)
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--upscale", action="store_true")
    args = p.parse_args()

    generate_and_swap(
        source_face_path=args.face,
        prompt=args.prompt,
        output_path=args.output,
        negative_prompt=args.negative,
        width=args.width,
        height=args.height,
        steps=args.steps,
        guidance=args.guidance,
        seed=args.seed,
        upscale=args.upscale,
    )
    print(f"Output: {args.output}")
