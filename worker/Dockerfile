# ONLYTWINS RunPod worker: FLUX LoRA training + FLUX generation + Real-ESRGAN
# Build: docker build -t onlytwins-worker ./worker
# Run: docker run --gpus all -e WORKER_SECRET=... -e APP_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... -e NEXT_PUBLIC_SUPABASE_URL=... onlytwins-worker

FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps: torch first (CUDA), then rest
COPY requirements.txt requirements-full.txt ./
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu121 \
    && pip install --no-cache-dir -r requirements-full.txt

# Optional: install realesrgan if available
RUN pip install --no-cache-dir realesrgan 2>/dev/null || true

COPY storage.py train_lora.py generate_flux.py main.py ./

# HF token for gated FLUX.1-dev (set at run time)
# ENV HF_TOKEN=
# ENV HUGGING_FACE_HUB_TOKEN=

CMD ["python3", "main.py"]
