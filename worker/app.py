#!/usr/bin/env python3
"""
RunPod Load Balancer HTTP server for face-swap and other jobs.
Single Flask app on PORT (default 8000) handles both health checks and API requests.
"""

import os
import sys
import time
import traceback
from flask import Flask, request, jsonify
from face_swap import do_face_swap

PORT = int(os.environ.get("PORT", 8000))

app = Flask("worker")


@app.route("/ping", methods=["GET"])
@app.route("/health", methods=["GET"])
def ping():
    """Health check endpoint — same port as API."""
    return jsonify({"status": "ok"}), 200


@app.route("/", methods=["POST"])
@app.route("/run", methods=["POST"])
def handler():
    """Main request handler for RunPod Load Balancer."""
    start = time.time()
    print(f"[worker] POST / received", flush=True)

    try:
        data = request.get_json() or {}
        input_data = data.get("input", {})
        job_type = input_data.get("type")
        print(f"[worker] job_type={job_type}", flush=True)

        if job_type == "faceswap":
            user_photo_url = input_data.get("user_photo_url")
            scenario_image_url = input_data.get("scenario_image_url")

            if not user_photo_url or not scenario_image_url:
                print(f"[worker] FAILED: missing URLs", flush=True)
                return jsonify({
                    "status": "FAILED",
                    "error": "Missing user_photo_url or scenario_image_url"
                }), 400

            print(f"[worker] Starting face swap...", flush=True)
            result_b64 = do_face_swap(user_photo_url, scenario_image_url)
            elapsed = round(time.time() - start, 2)

            if not result_b64:
                print(f"[worker] FAILED: do_face_swap returned None after {elapsed}s", flush=True)
                return jsonify({
                    "status": "FAILED",
                    "error": "Face swap processing failed"
                }), 500

            print(f"[worker] COMPLETED in {elapsed}s: {len(result_b64)} chars base64", flush=True)
            return jsonify({
                "status": "COMPLETED",
                "output": {"image_base64": result_b64}
            }), 200

        print(f"[worker] FAILED: unknown job type '{job_type}'", flush=True)
        return jsonify({
            "status": "FAILED",
            "error": f"Unknown job type: {job_type}"
        }), 400

    except Exception as e:
        elapsed = round(time.time() - start, 2)
        print(f"[worker] EXCEPTION after {elapsed}s: {e}", flush=True)
        traceback.print_exc(file=sys.stdout)
        sys.stdout.flush()
        return jsonify({
            "status": "FAILED",
            "error": str(e)
        }), 500


if __name__ == "__main__":
    print(f"[worker] Starting. Python={sys.version}, PORT={PORT}", flush=True)

    # Preload models at startup (before accepting requests)
    from face_swap import warmup
    warmup()

    # Log dependency versions
    try:
        import requests as _req
        print(f"[worker] deps: requests={_req.__version__} (direct REST upload, no supabase SDK)", flush=True)
    except Exception as e:
        print(f"[worker] deps check failed: {e}", flush=True)

    # Single server handles both health checks and API
    print(f"[worker] Listening on 0.0.0.0:{PORT}", flush=True)
    app.run(host="0.0.0.0", port=PORT, debug=False)
