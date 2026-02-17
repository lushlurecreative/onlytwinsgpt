#!/usr/bin/env python3
"""
RunPod Serverless entrypoint. Receives one job per invocation (training or generation).
Sets APP_URL and WORKER_SECRET from input, then runs the same logic as main.run_training_job / run_generation_job.
Reports GPU usage to app for cost tracking.
"""
import os
import time
import importlib
import runpod

try:
    import requests
except ImportError:
    requests = None


def report_gpu_usage(app_url, worker_secret, job_type, job_id, duration_sec, runpod_job_id=None):
    if not app_url or not worker_secret or not requests:
        return
    try:
        r = requests.post(
            f"{app_url}/api/internal/worker/gpu-usage",
            headers={"Authorization": f"Bearer {worker_secret}", "Content-Type": "application/json"},
            json={
                "job_type": job_type,
                "job_id": job_id,
                "duration_sec": round(duration_sec, 2),
                "runpod_job_id": runpod_job_id,
            },
            timeout=10,
        )
        if r.status_code != 200:
            print(f"gpu-usage report HTTP {r.status_code}")
    except Exception as e:
        print(f"gpu-usage report error: {e}")


def handler(job):
    inp = job.get("input") or {}
    app_url = (inp.get("app_url") or "").rstrip("/")
    worker_secret = inp.get("worker_secret") or ""
    os.environ["APP_URL"] = app_url
    os.environ["WORKER_SECRET"] = worker_secret

    job_type = inp.get("type")
    start = time.time()
    try:
        if job_type == "decode_watermark":
            from watermark import decode_from_url
            image_url = inp.get("image_url") or ""
            if not image_url:
                return {"status": "failed", "error": "Missing image_url"}
            result = decode_from_url(image_url)
            return {"status": "completed", "output": result}
        if job_type == "training":
            import main as main_mod
            importlib.reload(main_mod)
            main_mod.run_training_job({
                "id": inp.get("job_id"),
                "subject_id": inp.get("subject_id"),
                "sample_paths": inp.get("sample_paths") or [],
            })
            report_gpu_usage(app_url, worker_secret, "training", inp.get("job_id"), time.time() - start)
            return {"status": "completed"}
        if job_type == "generation":
            import main as main_mod
            importlib.reload(main_mod)
            gpu_job_type = inp.get("job_type") or "user"
            gpu_report_type = "lead_sample" if gpu_job_type == "lead_sample" else "generation"
            main_mod.run_generation_job({
                "id": inp.get("job_id"),
                "subject_id": inp.get("subject_id"),
                "preset_id": inp.get("preset_id"),
                "reference_image_path": inp.get("reference_image_path") or "",
                "lora_model_reference": inp.get("lora_model_reference"),
                "controlnet_input_path": inp.get("controlnet_input_path"),
                "job_type": gpu_job_type,
                "lead_id": inp.get("lead_id"),
            })
            report_gpu_usage(
                app_url, worker_secret, gpu_report_type, inp.get("job_id"),
                time.time() - start, job.get("id")
            )
            return {"status": "completed", "job_id": inp.get("job_id")}
        return {"status": "failed", "error": f"Unknown job type: {job_type}"}
    except Exception as e:
        return {"status": "failed", "error": str(e)}


runpod.serverless.start({"handler": handler})
