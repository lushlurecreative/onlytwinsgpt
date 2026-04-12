#!/usr/bin/env python3
"""
RunPod Serverless handler for face-swap + training jobs.
No Flask, no HTTP server — RunPod manages the container lifecycle.
Only billed while processing jobs (no idle costs).
"""

import os
import sys
import tempfile
import time
import traceback
import runpod
from face_swap import do_face_swap, warmup


def _run_training(input_data, job_id):
    """Handle a `type: "training"` job. Minimal smallest-correct path:
    download sample photos → train_lora.train_and_save → upload safetensors →
    PATCH internal worker endpoint with result. Returns a dict for RunPod."""
    # Lazy imports: keep face-swap cold-start fast; only pay torch/diffusers
    # import cost when a training job actually arrives.
    import requests  # already in requirements-gpu.txt via facefusionlib
    from storage import download_many_from_uploads, upload_to_uploads
    from train_lora import train_and_save

    training_job_id = input_data.get("job_id")
    subject_id = input_data.get("subject_id")
    sample_paths = input_data.get("sample_paths") or []
    app_url = (input_data.get("app_url") or "").rstrip("/")
    worker_secret = input_data.get("worker_secret") or ""
    max_train_steps = int(input_data.get("max_train_steps") or 300)
    batch_size = int(input_data.get("batch_size") or 1)

    if not training_job_id or not subject_id or not sample_paths or not app_url or not worker_secret:
        return {"error": "Missing required training fields (job_id, subject_id, sample_paths, app_url, worker_secret)"}

    print(f"[worker:{job_id}] TRAINING: job_id={training_job_id} subject={subject_id} "
          f"photos={len(sample_paths)} steps={max_train_steps} batch={batch_size}", flush=True)

    with tempfile.TemporaryDirectory(prefix="ot_train_") as tmp_root:
        instance_dir = os.path.join(tmp_root, "instance")
        output_dir = os.path.join(tmp_root, "out")
        os.makedirs(instance_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        # Download photos from Supabase uploads bucket
        downloaded = download_many_from_uploads(sample_paths, instance_dir)
        print(f"[worker:{job_id}] TRAINING: downloaded {len(downloaded)}/{len(sample_paths)} photos", flush=True)
        if len(downloaded) < 5:
            return {"error": f"Only {len(downloaded)}/{len(sample_paths)} training photos downloaded (minimum 5)"}

        # Run training
        train_start = time.time()
        lora_local_path = train_and_save(
            instance_data_dir=instance_dir,
            output_dir=output_dir,
            instance_prompt="photo of TOK person",
            max_train_steps=max_train_steps,
            batch_size=batch_size,
        )
        train_elapsed = round(time.time() - train_start, 1)
        print(f"[worker:{job_id}] TRAINING: LoRA saved to {lora_local_path} in {train_elapsed}s", flush=True)

        # Upload LoRA safetensors to Supabase uploads bucket under a stable path
        storage_path = f"models/{subject_id}/{training_job_id}/pytorch_lora_weights.safetensors"
        uploaded_url, upload_err = upload_to_uploads(
            lora_local_path,
            storage_path,
            content_type="application/octet-stream",
        )
        if not uploaded_url:
            return {"error": f"LoRA upload failed: {upload_err or 'unknown'}"}

        # PATCH the OnlyTwins internal worker endpoint so identity_models.model_path
        # is set and the model is activated before the RunPod webhook cascade fires.
        patch_url = f"{app_url}/api/internal/worker/training-jobs/{training_job_id}"
        try:
            resp = requests.patch(
                patch_url,
                headers={
                    "Authorization": f"Bearer {worker_secret}",
                    "Content-Type": "application/json",
                },
                json={
                    "status": "completed",
                    "lora_model_reference": storage_path,
                    "training_steps": max_train_steps,
                    "learning_rate": 1e-4,
                    "network_dim": 16,
                    "network_alpha": 32,
                    "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
                    "logs": f"Trained {max_train_steps} steps in {train_elapsed}s",
                },
                timeout=30,
            )
            print(f"[worker:{job_id}] TRAINING: internal PATCH {resp.status_code}: {resp.text[:300]}", flush=True)
        except Exception as patch_err:
            # Non-fatal: the webhook will still fire with COMPLETED and the
            # webhook cascade can still activate the model if it finds the
            # model_path (but it won't without this PATCH). Log and continue.
            print(f"[worker:{job_id}] TRAINING: internal PATCH failed: {patch_err}", flush=True)

        return {
            "status": "completed",
            "model_path": storage_path,
            "training_steps": max_train_steps,
            "train_elapsed_seconds": train_elapsed,
        }


def handler(job):
    """RunPod Serverless handler — receives job, returns result."""
    start = time.time()
    job_id = job.get("id", "unknown")
    input_data = job.get("input", {})
    job_type = input_data.get("type")

    print(f"[worker:{job_id}] Job received, type={job_type}", flush=True)

    try:
        if job_type == "faceswap":
            # Accept user_photo_urls (list) or legacy user_photo_url (string)
            user_photo_urls = input_data.get("user_photo_urls") or []
            if not user_photo_urls and input_data.get("user_photo_url"):
                user_photo_urls = [input_data["user_photo_url"]]
            scenario_image_url = input_data.get("scenario_image_url")

            if not user_photo_urls or not scenario_image_url:
                print(f"[worker:{job_id}] FAILED: missing URLs", flush=True)
                return {"error": "Missing user_photo_urls or scenario_image_url"}

            print(f"[worker:{job_id}] Starting face swap ({len(user_photo_urls)} source(s))...", flush=True)
            result_b64 = do_face_swap(user_photo_urls, scenario_image_url)
            elapsed = round(time.time() - start, 2)

            if not result_b64:
                print(f"[worker:{job_id}] FAILED: do_face_swap returned None after {elapsed}s", flush=True)
                return {"error": "Face swap processing failed"}

            print(f"[worker:{job_id}] COMPLETED in {elapsed}s: {len(result_b64)} chars base64", flush=True)
            return {"image_base64": result_b64}

        if job_type == "training":
            result = _run_training(input_data, job_id)
            elapsed = round(time.time() - start, 2)
            if "error" in result:
                print(f"[worker:{job_id}] TRAINING FAILED after {elapsed}s: {result['error']}", flush=True)
            else:
                print(f"[worker:{job_id}] TRAINING COMPLETED in {elapsed}s", flush=True)
            return result

        if job_type == "generation":
            # Delegate to the existing worker/main.py generation implementation.
            # Lazy import so face-swap / training cold starts are not penalized.
            app_url = (input_data.get("app_url") or "").rstrip("/")
            worker_secret = input_data.get("worker_secret") or ""
            os.environ["APP_URL"] = app_url
            os.environ["WORKER_SECRET"] = worker_secret

            try:
                import main as main_mod  # noqa: WPS433 (lazy import is intentional)
                import importlib
                importlib.reload(main_mod)
            except Exception as import_err:
                print(f"[worker:{job_id}] GENERATION FAILED: main import error: {import_err}", flush=True)
                return {"error": f"main import error: {import_err}"}

            gen_job_id = input_data.get("job_id")
            print(
                f"[worker:{job_id}] GENERATION: job_id={gen_job_id} "
                f"subject={input_data.get('subject_id')} preset={input_data.get('preset_id')}",
                flush=True,
            )

            try:
                success = main_mod.run_generation_job({
                    "id": gen_job_id,
                    "subject_id": input_data.get("subject_id"),
                    "preset_id": input_data.get("preset_id"),
                    "reference_image_path": input_data.get("reference_image_path") or "",
                    "lora_model_reference": input_data.get("lora_model_reference"),
                    "controlnet_input_path": input_data.get("controlnet_input_path"),
                    "job_type": input_data.get("job_type") or "user",
                    "lead_id": input_data.get("lead_id"),
                })
            except Exception as gen_err:
                elapsed = round(time.time() - start, 2)
                print(f"[worker:{job_id}] GENERATION FAILED after {elapsed}s: {gen_err}", flush=True)
                traceback.print_exc(file=sys.stdout)
                sys.stdout.flush()
                return {"error": str(gen_err)}

            elapsed = round(time.time() - start, 2)
            if success:
                print(f"[worker:{job_id}] GENERATION COMPLETED in {elapsed}s", flush=True)
                return {"status": "completed", "job_id": gen_job_id}
            else:
                print(f"[worker:{job_id}] GENERATION FAILED in {elapsed}s (internal)", flush=True)
                return {"error": f"Generation job {gen_job_id} failed internally"}

        print(f"[worker:{job_id}] FAILED: unknown job type '{job_type}'", flush=True)
        return {"error": f"Unknown job type: {job_type}"}

    except Exception as e:
        elapsed = round(time.time() - start, 2)
        print(f"[worker:{job_id}] EXCEPTION after {elapsed}s: {e}", flush=True)
        traceback.print_exc(file=sys.stdout)
        sys.stdout.flush()
        return {"error": str(e)}


if __name__ == "__main__":
    print(f"[worker] Starting RunPod Serverless. Python={sys.version}", flush=True)

    # Preload models at startup
    warmup()

    # Log dependency versions
    try:
        import requests as _req
        print(f"[worker] deps: requests={_req.__version__}", flush=True)
    except Exception as e:
        print(f"[worker] deps check failed: {e}", flush=True)

    # Start RunPod serverless handler
    print("[worker] Starting RunPod serverless handler...", flush=True)
    runpod.serverless.start({"handler": handler})
