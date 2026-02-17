# ONLYTWINS RunPod Worker

Runs on GPU (RunPod). Uses **SUPABASE_SERVICE_ROLE_KEY** only (never anon). Talks to the app via **WORKER_SECRET** (Bearer or X-Worker-Secret) or direct **DATABASE_URL**.

## Stack

1. **FLUX** – base render
2. **LoRA** – per-subject (train from training_jobs; store in `model_artifacts` bucket)
3. **IP-Adapter** – identity lock from reference image
4. **ControlNet** – pose/composition
5. **Real-ESRGAN** – mandatory 2x/4x upscale before marking job complete

## Consent

Before running any **training_job** or **generation_job**: resolve subject. If `subject_id` is set, **refuse** unless `subjects.consent_status = 'approved'`. If not approved, set job status to `failed` and log consent error.

## Storage

- **uploads** – user photos and final generated images only. Worker reads reference images from here and writes final outputs here.
- **model_artifacts** – LoRA and model binaries only. Path: `{subject_id}/lora.safetensors`. Create this bucket in Supabase (private). Do not store LoRA in `uploads`.

## Env (RunPod)

- `WORKER_SECRET` – shared secret for app internal API
- `APP_URL` – e.g. https://your-app.vercel.app (for GET /api/internal/worker/jobs, PATCH job routes)
- `SUPABASE_SERVICE_ROLE_KEY` – for storage and (optionally) PostgREST
- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` – Supabase project URL
- Optional: `DATABASE_URL` – direct Postgres instead of app API

## Run (light: poll + placeholders only)

```bash
pip install -r requirements.txt
export $(cat .env | xargs)
python main.py
```

## Run (full: FLUX LoRA + generation + optional Real-ESRGAN)

Requires GPU, ~24GB VRAM for training, ~12GB for inference. FLUX.1-dev is gated: set `HF_TOKEN` or `HUGGING_FACE_HUB_TOKEN`.

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements-full.txt
pip install realesrgan   # optional upscale
export $(cat .env | xargs)
python main.py
```

Or use Docker (from repo root):

```bash
docker build -t onlytwins-worker ./worker
docker run --gpus all --env-file worker/.env onlytwins-worker
```

## Flow

1. Poll `GET {APP_URL}/api/internal/worker/jobs` (header: `Authorization: Bearer {WORKER_SECRET}`).
2. **Training:** Check subject consent → download sample_paths from uploads → run FLUX LoRA training (`train_lora.py`) → upload LoRA to **model_artifacts** `{subject_id}/lora.safetensors` → PATCH job + subjects_models.
3. **Generation:** Check consent if subject_id → fetch preset (prompt/negative_prompt) → download reference image (and optional LoRA from model_artifacts) → run FLUX inference (`generate_flux.py`), optional Real-ESRGAN upscale → upload to **uploads** → PATCH job.
4. Repeat.

## Runbook (step-by-step)

1. **Create model_artifacts bucket**  
   After deploying the app: call `POST {APP_URL}/api/internal/setup/storage` with header `Authorization: Bearer {WORKER_SECRET}`, or run from repo root:  
   `WORKER_SECRET=xxx APP_URL=https://your-app.vercel.app npx tsx scripts/ensure-model-artifacts-bucket.ts`

2. **Set app env (Vercel)**  
   Add `WORKER_SECRET` (same value you will use on the worker). Optionally `APP_URL` if needed.

3. **Set worker env (RunPod)**  
   `WORKER_SECRET`, `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. For training/generation: `HF_TOKEN` or `HUGGING_FACE_HUB_TOKEN` (Hugging Face token with access to FLUX.1-dev).

4. **Run the worker**  
   On a RunPod GPU pod: install deps (see “Run (full)” above) and run `python main.py`. Or run the Docker image with `--gpus all` and the same env.

   **Start worker without terminal (Jupyter)**  
   If the RunPod web terminal does not accept input, use Jupyter instead:
   - In RunPod: **Connect** → **Start Jupyter Notebook** (or your template's equivalent).
   - In Jupyter, open `worker/start_worker.ipynb` (e.g. from the file browser under `/workspace/onlytwinsgpt/worker/`).
   - Set env vars in the RunPod pod template (**Edit Template** → **Environment Variables**) so they are available to Jupyter.
   - In the notebook: **Run** → **Run All** (or run the code cell). The worker runs and logs appear in the notebook; no web terminal required.

5. **Test**  
   In the app: create a subject, have admin approve consent, add 30–60 photos in vault, start training. Then trigger a generation request and confirm the worker processes jobs.

## Notes

- **model_artifacts bucket:** Use the setup API/script above, or create manually in Supabase Dashboard (Storage → New bucket, name: `model_artifacts`, private).
- **WORKER_SECRET:** Must match the app (Vercel). Generate with e.g. `openssl rand -hex 32`.
- **FLUX.1-dev:** Gated on Hugging Face. Accept the license and set `HF_TOKEN` so the worker can download the model.
