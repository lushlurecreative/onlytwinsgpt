#!/usr/bin/env python3
"""
RunPod Serverless entrypoint. Receives one job per invocation (training or generation).
Sets APP_URL and WORKER_SECRET from input, then runs the same logic as main.run_training_job / run_generation_job.
"""
import os
import importlib
import runpod


def handler(job):
    inp = job.get("input") or {}
    os.environ["APP_URL"] = (inp.get("app_url") or "").rstrip("/")
    os.environ["WORKER_SECRET"] = inp.get("worker_secret") or ""

    job_type = inp.get("type")
    try:
        if job_type == "training":
            import main as main_mod
            importlib.reload(main_mod)
            main_mod.run_training_job({
                "id": inp.get("job_id"),
                "subject_id": inp.get("subject_id"),
                "sample_paths": inp.get("sample_paths") or [],
            })
            return {"status": "completed"}
        if job_type == "generation":
            import main as main_mod
            importlib.reload(main_mod)
            main_mod.run_generation_job({
                "id": inp.get("job_id"),
                "subject_id": inp.get("subject_id"),
                "preset_id": inp.get("preset_id"),
                "reference_image_path": inp.get("reference_image_path") or "",
                "lora_model_reference": inp.get("lora_model_reference"),
                "controlnet_input_path": inp.get("controlnet_input_path"),
            })
            return {"status": "completed", "job_id": inp.get("job_id")}
        return {"status": "failed", "error": f"Unknown job type: {job_type}"}
    except Exception as e:
        return {"status": "failed", "error": str(e)}


runpod.serverless.start({"handler": handler})
