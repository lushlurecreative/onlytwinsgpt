"""
FLUX LoRA training: load FLUX.1-dev (4-bit NF4 quant), add LoRA adapters, train on instance
images using flow-matching loss, save safetensors.

Requires: HF token (FLUX.1-dev is gated), 24 GB+ GPU, diffusers==0.31.0, peft==0.13.2,
bitsandbytes==0.43.3, torch==2.2.0, transformers==4.44.2.

Run from worker dir:
  python train_lora.py --instance_data_dir ./samples --output_dir ./out \
      --instance_prompt "photo of TOK person"
"""

import argparse
import os
import sys
from pathlib import Path

# Optional heavy deps - fail with clear message if not installed
try:
    import torch
    import torch.nn.functional as F
    from PIL import Image
    from torch.utils.data import Dataset
    from torchvision import transforms
except ImportError as e:
    print("Install PyTorch and torchvision:", e, file=sys.stderr)
    sys.exit(1)

try:
    from diffusers import FluxPipeline, FluxTransformer2DModel
    from diffusers import BitsAndBytesConfig as DiffusersBitsAndBytesConfig
    from peft import LoraConfig
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
    batch_size: int = 1,
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
    prompt_embeds = prompt_embeds.to(device=device, dtype=dtype)
    pooled_embeds = pooled_embeds.to(device=device, dtype=dtype)
    text_ids = text_ids.to(device=device, dtype=dtype)

    del pipe.text_encoder
    del pipe.text_encoder_2
    pipe.text_encoder = None
    pipe.text_encoder_2 = None
    torch.cuda.empty_cache()
    print("Text encoders freed.", flush=True)

    # FLUX VAE normalization factors
    vae_shift = float(pipe.vae.config.shift_factor)
    vae_scale = float(pipe.vae.config.scaling_factor)
    print(f"VAE shift={vae_shift} scale={vae_scale}", flush=True)

    # FLUX.1-dev is guidance-distilled — transformer expects a guidance scalar per sample.
    guidance_embeds = bool(getattr(transformer.config, "guidance_embeds", False))
    print(f"Transformer guidance_embeds={guidance_embeds}", flush=True)

    # Freeze quantized base; only LoRA adapters are trainable.
    transformer.requires_grad_(False)
    if hasattr(transformer, "gradient_checkpointing_enable"):
        transformer.gradient_checkpointing_enable()

    # LoRA config targeting both double-stream and single-stream attention projections.
    # Match the diffusers official FLUX LoRA example — uses PeftAdapterMixin.add_adapter
    # (not get_peft_model wrap) so the transformer keeps its FluxTransformer2DModel forward
    # signature intact for all the FLUX-specific kwargs (txt_ids, img_ids, guidance, ...).
    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        init_lora_weights="gaussian",
        target_modules=["to_k", "to_q", "to_v", "to_out.0"],
    )
    transformer.add_adapter(lora_config)
    transformer.train()
    # DO NOT call transformer.to(device) — 4-bit base is already device-placed.

    trainable = [p for p in transformer.parameters() if p.requires_grad]
    num_trainable = sum(p.numel() for p in trainable)
    print(f"Trainable LoRA params: {num_trainable:,}", flush=True)

    # FLUX uses vae_scale_factor = 2 ** len(block_out_channels) (16 for FLUX), which is
    # twice the actual VAE downsample (8) because FLUX also packs latents into 2x2 patches.
    # Use the pipeline's property so it always matches the VAE that was loaded.
    vae_scale_factor = pipe.vae_scale_factor
    print(f"FluxPipeline.vae_scale_factor={vae_scale_factor}", flush=True)

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

    opt = torch.optim.AdamW(trainable, lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max_train_steps)

    global_step = 0
    print(f"Starting training for {max_train_steps} steps (batch={batch_size}, lr={lr})...", flush=True)

    while global_step < max_train_steps:
        for batch in dataloader:
            if global_step >= max_train_steps:
                break

            pixel_values = batch.to(device=device, dtype=dtype)
            bsz = pixel_values.shape[0]

            # --- VAE encode with FLUX's (raw - shift) * scale formula ---
            with torch.no_grad():
                raw_latents = pipe.vae.encode(pixel_values).latent_dist.sample()
                latents = (raw_latents - vae_shift) * vae_scale
            latents = latents.to(dtype=dtype)

            latent_h, latent_w = latents.shape[-2], latents.shape[-1]

            # --- Flow-matching noise (sigma ~ logit-normal on [0,1]) ---
            # Logit-normal density is what the FLUX paper and the official HF training
            # example use for timestep sampling on rectified-flow models.
            u = torch.randn(bsz, device=device, dtype=torch.float32)
            sigma = torch.sigmoid(u)  # (B,) in (0, 1)
            sigma_broadcast = sigma.view(-1, 1, 1, 1).to(dtype=latents.dtype)

            noise = torch.randn_like(latents)

            # Linear flow-matching interpolation between clean latents and noise
            noisy_latents = (1.0 - sigma_broadcast) * latents + sigma_broadcast * noise

            # --- Pack latents for FLUX transformer (B, C, H, W) -> (B, (H/2)*(W/2), C*4) ---
            # _pack_latents and _prepare_latent_image_ids BOTH expect the full latent
            # height/width and divide by 2 internally. Passing half (as I did initially)
            # produces a (latent_h/4)*(latent_w/4) rotary embedding that no longer matches
            # the 1024-token packed sequence, yielding a 1536-vs-768 shape mismatch inside
            # attention's apply_rotary_emb.
            packed_noisy_latents = FluxPipeline._pack_latents(
                noisy_latents,
                batch_size=bsz,
                num_channels_latents=noisy_latents.shape[1],
                height=latent_h,
                width=latent_w,
            )

            latent_image_ids = FluxPipeline._prepare_latent_image_ids(
                bsz,
                latent_h,
                latent_w,
                device,
                dtype,
            )

            # Guidance vector (FLUX.1-dev is guidance-distilled). Use 1.0 during training.
            guidance = (
                torch.ones(bsz, device=device, dtype=dtype) if guidance_embeds else None
            )

            # Expand pooled/prompt embeds to batch
            pe = prompt_embeds[:1].expand(bsz, -1, -1)
            po = pooled_embeds[:1].expand(bsz, -1)

            # FLUX transformer expects timestep in [0, 1] (see FluxPipeline.__call__
            # which passes `timestep / 1000` — we sampled sigma directly in [0,1]).
            timestep = sigma.to(dtype=dtype)

            # --- Forward ---
            model_pred_packed = transformer(
                hidden_states=packed_noisy_latents,
                timestep=timestep,
                guidance=guidance,
                pooled_projections=po,
                encoder_hidden_states=pe,
                txt_ids=text_ids,
                img_ids=latent_image_ids,
                return_dict=False,
            )[0]

            # --- Unpack prediction back to (B, C, H, W) to match target shape ---
            # Image-space height/width = latent_h * (vae_scale_factor / 2). With
            # vae_scale_factor=16 for FLUX, that's latent_h * 8 — matches the VAE's
            # actual downsample of 8. This matches the official FLUX LoRA training
            # script's call pattern (examples/dreambooth/train_dreambooth_lora_flux.py).
            image_h = int(latent_h * vae_scale_factor / 2)
            image_w = int(latent_w * vae_scale_factor / 2)
            model_pred = FluxPipeline._unpack_latents(
                model_pred_packed,
                height=image_h,
                width=image_w,
                vae_scale_factor=vae_scale_factor,
            )

            # --- Flow-matching target: velocity = noise - clean_latents ---
            target = (noise - latents).to(dtype=torch.float32)
            loss = F.mse_loss(model_pred.to(torch.float32), target, reduction="mean")

            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(trainable, 1.0)
            opt.step()
            scheduler.step()
            global_step += 1

            if global_step == 1 or global_step % 25 == 0:
                print(
                    f"Step {global_step}/{max_train_steps} loss={loss.item():.4f} "
                    f"sigma_mean={float(sigma.mean()):.3f}",
                    flush=True,
                )

    # Save LoRA via FluxPipeline.save_lora_weights so the resulting
    # pytorch_lora_weights.safetensors is loadable via pipe.load_lora_weights() — this
    # handles the "transformer." key prefixing diffusers' FluxLoraLoaderMixin expects.
    # Cast the LoRA state dict to bfloat16 before saving: peft trains LoRA params in
    # fp32 for optimizer stability, but the saved artifact is only ever loaded for
    # inference, so fp32 wastes 2x disk/bandwidth. Supabase uploads bucket on the free
    # tier caps objects at 50 MB — fp32 FLUX LoRA at r=16 is ~75 MB and gets HTTP 413;
    # bf16 is ~38 MB and uploads fine.
    transformer.eval()
    transformer_lora_layers = get_peft_model_state_dict(transformer)
    transformer_lora_layers = {
        k: v.detach().to(torch.bfloat16).contiguous()
        for k, v in transformer_lora_layers.items()
    }
    FluxPipeline.save_lora_weights(
        save_directory=output_dir,
        transformer_lora_layers=transformer_lora_layers,
        text_encoder_lora_layers=None,
    )
    out_path = os.path.join(output_dir, "pytorch_lora_weights.safetensors")

    # Log the exact saved file size so the worker log shows bytes + MB for every run —
    # this is the single source of truth for diagnosing Supabase upload failures.
    try:
        saved_bytes = os.path.getsize(out_path)
    except OSError as e:
        saved_bytes = -1
        print(f"LoRA size stat failed: {e}", flush=True)
    saved_mb = saved_bytes / (1024 * 1024) if saved_bytes >= 0 else -1
    print(
        f"Saved LoRA to {out_path} dtype=bf16 bytes={saved_bytes} mb={saved_mb:.2f}",
        flush=True,
    )
    return out_path


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--instance_data_dir", required=True, help="Directory of training images")
    p.add_argument("--output_dir", required=True, help="Where to save LoRA safetensors")
    p.add_argument("--instance_prompt", default=DEFAULT_INSTANCE_PROMPT)
    p.add_argument("--max_train_steps", type=int, default=DEFAULT_STEPS)
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--batch_size", type=int, default=1)
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
