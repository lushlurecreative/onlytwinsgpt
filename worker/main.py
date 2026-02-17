#!/usr/bin/env python3
"""
ONLYTWINS RunPod worker.
Polls app for pending training_jobs and generation_jobs.
Enforces consent: refuse training/generation unless subject.consent_status = 'approved'.
Training: LoRA training -> upload to model_artifacts bucket -> update subjects_models.
Generation: FLUX + LoRA + IP-Adapter + ControlNet -> Real-ESRGAN -> upload to uploads -> update job.
"""

import os
import tempfile
import time
import uuid
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from storage import (
    download_from_uploads,
    download_many_from_uploads,
    download_from_model_artifacts,
    upload_to_model_artifacts,
    upload_to_uploads,
)

APP_URL = os.environ.get("APP_URL", "").rstrip("/")
WORKER_SECRET = os.environ.get("WORKER_SECRET", "")


def headers():
    return {
        "Authorization": f"Bearer {WORKER_SECRET}",
        "Content-Type": "application/json",
    }


def poll_jobs():
    """Fetch pending training and generation jobs from app internal API."""
    if not APP_URL or not WORKER_SECRET:
        print("Poll skip: APP_URL or WORKER_SECRET not set")
        return None, None
    try:
        r = requests.get(f"{APP_URL}/api/internal/worker/jobs", headers=headers(), timeout=30)
        if r.status_code != 200:
            print(f"Poll HTTP {r.status_code} (check WORKER_SECRET and APP_URL)")
            return [], []
        data = r.json()
        return data.get("training_jobs", []), data.get("generation_jobs", [])
    except Exception as e:
        print(f"Poll error: {e}")
        return [], []


def subject_consent_allowed(subject_id: str) -> bool:
    """Return True if subject exists and consent_status == 'approved'."""
    if not subject_id or not APP_URL or not WORKER_SECRET:
        return False
    try:
        r = requests.get(
            f"{APP_URL}/api/internal/worker/subjects/{subject_id}",
            headers=headers(),
            timeout=10,
        )
        if r.status_code != 200:
            return False
        data = r.json()
        return data.get("allowed") is True
    except Exception as e:
        print(f"Consent check error: {e}")
        return False


def update_training_job(
    job_id: str,
    status: str,
    logs: str = None,
    started_at: str = None,
    finished_at: str = None,
    lora_model_reference: str = None,
):
    """PATCH training job status (worker auth). When status=completed, send lora_model_reference to update subjects_models."""
    payload = {"status": status}
    if logs is not None:
        payload["logs"] = logs
    if started_at is not None:
        payload["started_at"] = started_at
    if finished_at is not None:
        payload["finished_at"] = finished_at
    if lora_model_reference is not None:
        payload["lora_model_reference"] = lora_model_reference
    try:
        r = requests.patch(
            f"{APP_URL}/api/internal/worker/training-jobs/{job_id}",
            headers=headers(),
            json=payload,
            timeout=15,
        )
        return r.status_code == 200
    except Exception as e:
        print(f"Update training job error: {e}")
        return False


def update_generation_job(job_id: str, status: str, output_path: str = None):
    """PATCH generation job status and output_path (worker auth)."""
    payload = {"status": status}
    if output_path is not None:
        payload["output_path"] = output_path
    try:
        r = requests.patch(
            f"{APP_URL}/api/internal/worker/generation-jobs/{job_id}",
            headers=headers(),
            json=payload,
            timeout=15,
        )
        return r.status_code == 200
    except Exception as e:
        print(f"Update generation job error: {e}")
        return False


def get_preset(preset_id: str) -> dict:
    """Fetch preset prompt/negative_prompt by id from internal API."""
    if not APP_URL or not WORKER_SECRET:
        return {}
    try:
        r = requests.get(
            f"{APP_URL}/api/internal/worker/presets/{preset_id}",
            headers=headers(),
            timeout=10,
        )
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"Preset fetch error: {e}")
    return {}


def run_training_job(job: dict) -> None:
    """
    Run LoRA training for one job.
    - Check subject.consent_status == 'approved'.
    - Download sample_paths from uploads bucket.
    - Run training (placeholder: write minimal LoRA file); upload to model_artifacts.
    - Update training_jobs and subjects_models via PATCH.
    """
    job_id = job.get("id")
    subject_id = job.get("subject_id")
    print(f"Processing training job {job_id} (subject {subject_id})")
    sample_paths = job.get("sample_paths") or []

    if not subject_consent_allowed(subject_id):
        update_training_job(job_id, "failed", "Consent not approved for subject.")
        return

    update_training_job(job_id, "running", "Training started", started_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))

    with tempfile.TemporaryDirectory() as tmp:
        samples_dir = os.path.join(tmp, "samples")
        local_paths = download_many_from_uploads(sample_paths, samples_dir)
        if len(local_paths) < 10:
            update_training_job(job_id, "failed", f"Could not download enough samples (got {len(local_paths)}).")
            return

        out_dir = os.path.join(tmp, "lora_out")
        try:
            from train_lora import train_and_save
            lora_file = train_and_save(
                instance_data_dir=samples_dir,
                output_dir=out_dir,
                instance_prompt="photo of TOK person",
                max_train_steps=int(os.environ.get("FLUX_LORA_STEPS", "500")),
            )
        except ImportError as e:
            update_training_job(job_id, "failed", f"Training module missing (install torch, diffusers, peft): {e}")
            return
        except Exception as e:
            update_training_job(job_id, "failed", f"Training failed: {e}")
            return

        storage_ref = f"{subject_id}/lora.safetensors"
        if not upload_to_model_artifacts(lora_file, storage_ref):
            update_training_job(job_id, "failed", "Failed to upload LoRA to model_artifacts.")
            return

    lora_model_reference = f"model_artifacts/{storage_ref}"
    update_training_job(
        job_id,
        "completed",
        "Training completed (FLUX LoRA).",
        finished_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        lora_model_reference=lora_model_reference,
    )


def run_generation_job(job: dict) -> None:
    """
    Run one generation job.
    - If subject_id set, verify consent; else (lead sample) allow.
    - Download reference_image_path, run FLUX+LoRA+IP-Adapter+ControlNet (placeholder: copy ref), upload to uploads.
    """
    job_id = job.get("id")
    subject_id = job.get("subject_id")
    reference_image_path = job.get("reference_image_path") or ""

    if subject_id and not subject_consent_allowed(subject_id):
        update_generation_job(job_id, "failed", None)
        return

    update_generation_job(job_id, "running")

    preset_id = job.get("preset_id")
    preset = get_preset(preset_id) if preset_id else {}
    prompt = (preset.get("prompt") or "A realistic photo, high quality, natural lighting.").strip()
    negative_prompt = (preset.get("negative_prompt") or "").strip()
    lora_model_reference = job.get("lora_model_reference")

    with tempfile.TemporaryDirectory() as tmp:
        ref_local = os.path.join(tmp, "ref.jpg")
        if not download_from_uploads(reference_image_path, ref_local):
            update_generation_job(job_id, "failed", None)
            return

        lora_local = None
        if lora_model_reference and lora_model_reference.startswith("model_artifacts/"):
            storage_path = lora_model_reference.replace("model_artifacts/", "", 1)
            lora_local = os.path.join(tmp, "lora.safetensors")
            if not download_from_model_artifacts(storage_path, lora_local):
                lora_local = None

        try:
            from generate_flux import generate
            out_local = os.path.join(tmp, "out.png")
            generate(
                prompt=prompt,
                negative_prompt=negative_prompt,
                output_path=out_local,
                lora_path=lora_local,
                upscale=True,
            )
        except ImportError as e:
            print(f"Generation module missing: {e}")
            update_generation_job(job_id, "failed", None)
            return
        except Exception as e:
            print(f"Generation failed: {e}")
            update_generation_job(job_id, "failed", None)
            return

        user_prefix = reference_image_path.split("/")[0] if "/" in reference_image_path else "generated"
        output_path = f"{user_prefix}/generated/{job_id}-{uuid.uuid4().hex[:8]}.jpg"
        if not upload_to_uploads(out_local, output_path):
            update_generation_job(job_id, "failed", None)
            return

    update_generation_job(job_id, "completed", output_path)


def main():
    poll_interval = int(os.environ.get("WORKER_POLL_INTERVAL_SEC", "15"))
    print(f"Worker started. Polling {APP_URL or 'APP_URL not set'} every {poll_interval}s.")
    last_idle_log = 0.0
    while True:
        training_jobs, generation_jobs = poll_jobs()
        if training_jobs is None:
            time.sleep(poll_interval)
            continue
        if training_jobs or generation_jobs:
            print(f"Poll: {len(training_jobs)} training, {len(generation_jobs)} generation jobs")
        else:
            now = time.time()
            if now - last_idle_log >= 60:
                print("Polling... (no jobs)")
                last_idle_log = now
        for job in training_jobs:
            try:
                run_training_job(job)
            except Exception as e:
                print(f"Training job error: {e}")
                import traceback
                traceback.print_exc()
        for job in generation_jobs:
            try:
                run_generation_job(job)
            except Exception as e:
                print(f"Generation job error: {e}")
                import traceback
                traceback.print_exc()
        time.sleep(poll_interval)


if __name__ == "__main__":
    main()
