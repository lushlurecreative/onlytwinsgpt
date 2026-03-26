#!/usr/bin/env python3
"""
RunPod Serverless handler for face-swap jobs.
No Flask, no HTTP server — RunPod manages the container lifecycle.
Only billed while processing jobs (no idle costs).
"""

import os
import sys
import time
import traceback
import runpod
from face_swap import do_face_swap, warmup


def handler(job):
    """RunPod Serverless handler — receives job, returns result."""
    start = time.time()
    job_id = job.get("id", "unknown")
    input_data = job.get("input", {})
    job_type = input_data.get("type")

    print(f"[worker:{job_id}] Job received, type={job_type}", flush=True)

    try:
        if job_type == "faceswap":
            user_photo_url = input_data.get("user_photo_url")
            scenario_image_url = input_data.get("scenario_image_url")

            if not user_photo_url or not scenario_image_url:
                print(f"[worker:{job_id}] FAILED: missing URLs", flush=True)
                return {"error": "Missing user_photo_url or scenario_image_url"}

            print(f"[worker:{job_id}] Starting face swap...", flush=True)
            result_b64 = do_face_swap(user_photo_url, scenario_image_url)
            elapsed = round(time.time() - start, 2)

            if not result_b64:
                print(f"[worker:{job_id}] FAILED: do_face_swap returned None after {elapsed}s", flush=True)
                return {"error": "Face swap processing failed"}

            print(f"[worker:{job_id}] COMPLETED in {elapsed}s: {len(result_b64)} chars base64", flush=True)
            return {"image_base64": result_b64}

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
