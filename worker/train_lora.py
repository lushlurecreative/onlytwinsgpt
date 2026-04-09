"""
FLUX LoRA training: load FLUX.1-dev, add LoRA, train on instance images, save safetensors.
Requires: HF token (FLUX.1-dev is gated), GPU, diffusers, peft, torch, transformers.
Run from worker dir: python train_lora.py --instance_data_dir ./samples --output_dir ./out --instance_prompt "photo of TOK person"
"""

import argparse
import os
import sys
from pathlib import Path

# Optional heavy deps - fail with clear message if not installed
try:
    import torch
    from PIL import Image
    from torch.utils.data import Dataset
    from torchvision import transforms
except ImportError as e:
    print("Install PyTorch and torchvision:", e, file=sys.stderr)
    sys.exit(1)

try:
    from diffusers import FluxPipeline, FluxTransformer2DModel
    from diffusers import BitsAndBytesConfig as DiffusersBitsAndBytesConfig
    from peft import LoraConfig, get_peft_model
    from peft.utils import get_peft_model_state_dict
    import safetensors.torch
except ImportError as e:
    print("Install diffusers>=0.31, peft, bitsandbytes, safetensors:", e, file=sys.stderr)
    sys.exit(1)


FLUX_MODEL = "black-forest-labs/FLUX.1-dev"
DEFAULT_INSTANCE_PROMPT = "photo of TOK person"
RESOLUTION = 512  # 512 keeps VRAM low enough for 4-bit FLUX LoRA on a 24 GB card
DEFAULT_STEPS = 500  # Tune for quality/speed; 500–1500 typical


class ImageFolderDataset(Dataset):
    def __init__(self, root: str, size: int = RESOLUTION):
        self.root = Path(root)
        self.paths = []
        for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
            self.paths.extend(self.root.glob(ext))
        self.paths = [str(p) for p in sorted(self.paths)]
        self.size = size
        self.transform = transforms.Compose([
            transforms.Resize(size, interpolation=transforms.InterpolationMode.BILINEAR),
            transforms.CenterCrop(size),
            transforms.ToTensor(),
            transforms.Normalize([0.5], [0.5]),
        ])

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, i):
        img = Image.open(self.paths[i]).convert("RGB")
        return self.transform(img)


def train_and_save(
    instance_data_dir: str,
    output_dir: str,
    instance_prompt: str = DEFAULT_INSTANCE_PROMPT,
    max_train_steps: int = DEFAULT_STEPS,
    lr: float = 1e-4,
    batch_size: int = 2,
    seed: int = 42,
) -> str:
    """Train FLUX LoRA and save to output_dir. Returns path to saved safetensors."""
    os.makedirs(output_dir, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device != "cuda":
        print("Warning: no CUDA; training will be slow.", file=sys.stderr)

    torch.manual_seed(seed)
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")

    # 4-bit NF4 quantize the FLUX transformer so it fits on a 24 GB GPU.
    # fp16/bf16 transformer is ~22 GB; nf4 is ~6 GB and still trainable via LoRA adapters.
    nf4_config = DiffusersBitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=dtype,
    )
    print("Loading FLUX transformer in 4-bit NF4 (this may download ~24 GB)...", flush=True)
    transformer = FluxTransformer2DModel.from_pretrained(
        FLUX_MODEL,
        subfolder="transformer",
        quantization_config=nf4_config,
        torch_dtype=dtype,
        token=hf_token,
    )

    print("Loading FLUX pipeline with quantized transformer...", flush=True)
    pipe = FluxPipeline.from_pretrained(
        FLUX_MODEL,
        transformer=transformer,
        torch_dtype=dtype,
        token=hf_token,
    )

    # Move non-transformer modules to GPU (4-bit transformer is already device-placed).
    pipe.vae.to(device)
    pipe.text_encoder.to(device)
    pipe.text_encoder_2.to(device)

    # Encode the instance prompt once, then drop the text encoders to free ~10 GB VRAM.
    with torch.no_grad():
        prompt_embeds, pooled_embeds, text_ids = pipe.encode_prompt(
            instance_prompt,
            prompt_2=instance_prompt,
            device=device,
        )

    pipe.text_encoder = None
    pipe.text_encoder_2 = None
    torch.cuda.empty_cache()
    print("Text encoders freed.", flush=True)

    # Freeze quantized base; only LoRA adapters are trainable.
    transformer.requires_grad_(False)
    if hasattr(transformer, "gradient_checkpointing_enable"):
        transformer.gradient_checkpointing_enable()

    # LoRA config (attention layers)
    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        init_lora_weights="gaussian",
        target_modules=["to_k", "to_q", "to_v", "to_out.0"],
    )
    transformer = get_peft_model(transformer, lora_config)
    transformer.train()
    # DO NOT call transformer.to(device) — 4-bit base is already device-placed.

    # Dataset and dataloader
    dataset = ImageFolderDataset(instance_data_dir, size=RESOLUTION)
    if len(dataset) < 5:
        raise ValueError(f"Need at least 5 images in {instance_data_dir}, got {len(dataset)}")
    dataloader = torch.utils.data.DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=0,
    )

    trainable = [p for p in transformer.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(trainable, lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max_train_steps)

    global_step = 0
    transformer.train()
    while global_step < max_train_steps:
        for batch in dataloader:
            if global_step >= max_train_steps:
                break
            pixel_values = batch.to(device, dtype=dtype)
            # VAE encode
            with torch.no_grad():
                latents = pipe.vae.encode(pixel_values).latent_dist.sample()
                latents = latents * pipe.vae.config.scaling_factor
            # Sample timestep
            timesteps = torch.randint(0, pipe.scheduler.config.num_train_timesteps, (pixel_values.shape[0],), device=device).long()
            noise = torch.randn_like(latents, device=device, dtype=dtype)
            noisy_latents = pipe.scheduler.add_noise(latents, noise, timesteps)

            # Expand prompt embeds for batch
            batch_size_curr = pixel_values.shape[0]
            pe = prompt_embeds[:1].expand(batch_size_curr, -1, -1)
            po = pooled_embeds[:1].expand(batch_size_curr, -1)

            # FLUX uses flow matching: model predicts velocity; target = noise - latents
            model_pred = transformer(
                noisy_latents,
                timesteps,
                encoder_hidden_states=pe,
                pooled_projections=po,
                return_dict=False,
            )[0]
            velocity_target = noise - latents
            loss = torch.nn.functional.mse_loss(model_pred.float(), velocity_target.float(), reduction="mean")

            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(trainable, 1.0)
            opt.step()
            scheduler.step()
            global_step += 1
            if global_step % 50 == 0:
                print(f"Step {global_step}/{max_train_steps} loss={loss.item():.4f}")

    # Save LoRA
    lora_state = get_peft_model_state_dict(transformer, adapter_name="default")
    # Diffusers expects unet key format for Flux; transformer LoRA is often saved with transformer prefix
    state_for_save = {k.replace("base_model.model.", ""): v for k, v in lora_state.items()}
    out_path = os.path.join(output_dir, "pytorch_lora_weights.safetensors")
    safetensors.torch.save_file(state_for_save, out_path)
    print("Saved LoRA to", out_path)
    return out_path


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--instance_data_dir", required=True, help="Directory of training images")
    p.add_argument("--output_dir", required=True, help="Where to save LoRA safetensors")
    p.add_argument("--instance_prompt", default=DEFAULT_INSTANCE_PROMPT)
    p.add_argument("--max_train_steps", type=int, default=DEFAULT_STEPS)
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--batch_size", type=int, default=2)
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()
    train_and_save(
        instance_data_dir=args.instance_data_dir,
        output_dir=args.output_dir,
        instance_prompt=args.instance_prompt,
        max_train_steps=args.max_train_steps,
        lr=args.lr,
        batch_size=args.batch_size,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
