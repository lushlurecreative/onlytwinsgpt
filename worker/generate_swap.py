"""
2-step generation pipeline: FLUX scene generation + FaceFusion face swap.

Step 1: FLUX generates a base scene image (with optional LoRA for rough identity).
Step 2: FaceFusion swaps the source face onto the generated person.
Result: person in scene with the correct facial identity.
"""

import os
import tempfile

import cv2


def generate_and_swap(
    source_face_path: str,
    prompt: str,
    output_path: str,
    negative_prompt: str = "",
    upscale: bool = True,
    lora_path: str = None,
    lora_scale: float = 0.9,
    num_inference_steps: int = 28,
    guidance_scale: float = 3.5,
    seed: int = None,
):
    """
    Generate a scene image with FLUX, then swap the source face onto it.

    Args:
        source_face_path: Path to the source face image (training photo).
        prompt: Text prompt for FLUX generation.
        output_path: Where to save the final composited image.
        negative_prompt: Negative prompt (unused by FLUX but kept for compat).
        upscale: Whether to upscale (handled by face_swap pipeline).
        lora_path: Optional path to LoRA weights for identity.
        lora_scale: LoRA influence strength (default 0.9).
        num_inference_steps: FLUX inference steps.
        guidance_scale: FLUX guidance scale.
        seed: Optional seed for reproducibility.
    """
    from generate_flux import generate
    from face_swap import swap_faces

    # Step 1: Generate base scene image with FLUX.
    # Do NOT upscale here — face_swap pipeline handles upscale after swap.
    base_fd, base_path = tempfile.mkstemp(suffix=".png", prefix="flux_base_")
    os.close(base_fd)

    try:
        print(f"[generate_swap] Step 1: FLUX generation (lora={'yes' if lora_path else 'no'})", flush=True)
        generate(
            prompt=prompt,
            negative_prompt=negative_prompt,
            output_path=base_path,
            lora_path=lora_path,
            lora_scale=lora_scale,
            upscale=False,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            seed=seed,
        )

        if not os.path.isfile(base_path) or os.path.getsize(base_path) < 1000:
            raise RuntimeError("FLUX generation produced no valid output file")

        print(f"[generate_swap] Step 1 done: {os.path.getsize(base_path)} bytes", flush=True)

        # Step 2: Swap the source face onto the generated scene.
        print(f"[generate_swap] Step 2: FaceFusion face swap (source={source_face_path})", flush=True)
        result = swap_faces([source_face_path], base_path)

        if result is None:
            print("[generate_swap] Face swap returned None — using FLUX output as fallback", flush=True)
            # If face swap fails (no face detected in target), fall back to raw FLUX output.
            # Still upscale if requested.
            if upscale:
                generate(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    output_path=output_path,
                    lora_path=lora_path,
                    lora_scale=lora_scale,
                    upscale=True,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    seed=seed,
                )
            else:
                import shutil
                shutil.copy(base_path, output_path)
        else:
            cv2.imwrite(output_path, result, [cv2.IMWRITE_JPEG_QUALITY, 95])
            print(f"[generate_swap] Done: {result.shape}, saved to {output_path}", flush=True)
    finally:
        if os.path.isfile(base_path):
            try:
                os.remove(base_path)
            except OSError:
                pass
