"""
FLUX inference: load pipeline, optional LoRA, run with preset prompt, upscale with Real-ESRGAN, save image.
Requires: GPU, diffusers, torch; optional realesrgan for upscale.
"""

import os
import sys
from pathlib import Path

try:
    import torch
    from PIL import Image
except ImportError as e:
    print("Install PyTorch and PIL:", e, file=sys.stderr)
    sys.exit(1)

try:
    from diffusers import FluxPipeline, FluxTransformer2DModel
    from diffusers import BitsAndBytesConfig as DiffusersBitsAndBytesConfig
except ImportError as e:
    print("Install diffusers>=0.31 and bitsandbytes:", e, file=sys.stderr)
    sys.exit(1)

FLUX_MODEL = "black-forest-labs/FLUX.1-dev"
DEFAULT_STEPS = 28
DEFAULT_GUIDANCE = 3.5
DEFAULT_WIDTH = 1024
DEFAULT_HEIGHT = 1024
UPSCALE_FACTOR = 2  # 2x or 4x


def load_upscaler():
    try:
        from realesrgan import RealESRGAN
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = RealESRGAN(device, scale=UPSCALE_FACTOR)
        model.load_weights(f"RealESRGAN_x{UPSCALE_FACTOR}plus", download=True)
        return model
    except Exception as e:
        print("Real-ESRGAN not available, skipping upscale:", e, file=sys.stderr)
    return None


def generate(
    prompt: str,
    negative_prompt: str = "",
    output_path: str = "out.png",
    lora_path: str = None,
    lora_scale: float = 0.9,
    ref_image_path: str = None,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    num_inference_steps: int = DEFAULT_STEPS,
    guidance_scale: float = DEFAULT_GUIDANCE,
    seed: int = None,
    upscale: bool = True,
) -> str:
    """
    Run FLUX with optional LoRA, save image, optionally upscale with Real-ESRGAN.
    Returns the path to the final image (upscaled if upscale=True and Real-ESRGAN available).
    """
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")

    # Load the FLUX transformer in 4-bit NF4 so it fits on a 24 GB GPU for inference.
    # bf16 transformer is ~22 GB and leaves no room for activations on an RTX 4090;
    # NF4 is ~6 GB. Same pattern proven in worker/train_lora.py.
    nf4_config = DiffusersBitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=dtype,
    )
    print("Loading FLUX transformer in 4-bit NF4...", flush=True)
    transformer = FluxTransformer2DModel.from_pretrained(
        FLUX_MODEL,
        subfolder="transformer",
        quantization_config=nf4_config,
        torch_dtype=dtype,
        token=token,
    )
    print("Loading FLUX pipeline with quantized transformer...", flush=True)
    pipe = FluxPipeline.from_pretrained(
        FLUX_MODEL,
        transformer=transformer,
        torch_dtype=dtype,
        token=token,
    )
    # DO NOT call pipe.to(device) — the 4-bit transformer is already device-placed.
    # Move the non-quantized submodules individually.
    pipe.vae.to(device)
    if getattr(pipe, "text_encoder", None) is not None:
        pipe.text_encoder.to(device)
    if getattr(pipe, "text_encoder_2", None) is not None:
        pipe.text_encoder_2.to(device)

    if lora_path and os.path.isfile(lora_path):
        lora_dir = os.path.dirname(os.path.abspath(lora_path))
        weight_name = os.path.basename(lora_path)
        pipe.load_lora_weights(lora_dir, weight_name=weight_name)
        pipe.set_adapters(["default"], adapter_weights=[lora_scale])
        print(f"LoRA loaded: {weight_name}, scale={lora_scale}", flush=True)
    elif lora_path and os.path.isdir(lora_path):
        pipe.load_lora_weights(lora_path, weight_name="pytorch_lora_weights.safetensors")
        pipe.set_adapters(["default"], adapter_weights=[lora_scale])
        print(f"LoRA loaded from dir, scale={lora_scale}", flush=True)

    generator = None
    if seed is not None:
        generator = torch.Generator(device=device).manual_seed(seed)

    out_dir = os.path.dirname(output_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    base_path = output_path
    if upscale:
        base_path = output_path.replace(".png", "_pre.png").replace(".jpg", "_pre.jpg")
        if base_path == output_path:
            base_path = output_path + "_pre.png"

    # FLUX is a flow-matching / guidance-distilled model and does not accept
    # negative_prompt — passing it raises TypeError on FluxPipeline.__call__.
    image = pipe(
        prompt=prompt,
        width=width,
        height=height,
        num_inference_steps=num_inference_steps,
        guidance_scale=guidance_scale,
        generator=generator,
    ).images[0]

    image.save(base_path)

    if upscale:
        upscaler = load_upscaler()
        if upscaler is not None:
            try:
                sr_image = upscaler.predict(image)
                if hasattr(sr_image, "save"):
                    sr_image.save(output_path)
                else:
                    Image.fromarray(sr_image).save(output_path)
                if base_path != output_path and os.path.isfile(base_path):
                    try:
                        os.remove(base_path)
                    except OSError:
                        pass
                return output_path
            except Exception as e:
                print("Upscale failed, using pre-upscale image:", e, file=sys.stderr)
    if base_path != output_path and os.path.isfile(base_path):
        import shutil
        shutil.copy(base_path, output_path)
        return output_path
    return base_path


def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--prompt", required=True)
    p.add_argument("--negative_prompt", default="")
    p.add_argument("--output", default="out.png")
    p.add_argument("--lora_path", default=None)
    p.add_argument("--lora_scale", type=float, default=0.9)
    p.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    p.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    p.add_argument("--steps", type=int, default=DEFAULT_STEPS)
    p.add_argument("--guidance", type=float, default=DEFAULT_GUIDANCE)
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--no_upscale", action="store_true")
    args = p.parse_args()
    generate(
        prompt=args.prompt,
        negative_prompt=args.negative_prompt,
        output_path=args.output,
        lora_path=args.lora_path,
        lora_scale=args.lora_scale,
        width=args.width,
        height=args.height,
        num_inference_steps=args.steps,
        guidance_scale=args.guidance,
        seed=args.seed,
        upscale=not args.no_upscale,
    )
    print("Saved to", args.output)


if __name__ == "__main__":
    main()
