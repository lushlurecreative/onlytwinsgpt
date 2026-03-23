#!/usr/bin/env python3
"""
RunPod Load Balancer HTTP server for face-swap and other jobs.
Runs health check on PORT_HEALTH, main API on PORT.
"""

import os
import sys
import time
import threading
import traceback
from flask import Flask, request, jsonify
from face_swap import do_face_swap

PORT = int(os.environ.get("PORT", 8000))
PORT_HEALTH = int(os.environ.get("PORT_HEALTH", 8001))

# Main API app
app = Flask("api")

# Health check app
health_app = Flask("health")


@health_app.route("/ping", methods=["GET"])
def ping():
    """Health check endpoint."""
    return jsonify({"status": "ok"}), 200


@app.route("/", methods=["POST"])
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
            result_url = do_face_swap(user_photo_url, scenario_image_url)
            elapsed = round(time.time() - start, 2)

            if not result_url:
                print(f"[worker] FAILED: do_face_swap returned None after {elapsed}s", flush=True)
                return jsonify({
                    "status": "FAILED",
                    "error": "Face swap processing failed"
                }), 500

            print(f"[worker] COMPLETED in {elapsed}s: {result_url}", flush=True)
            return jsonify({
                "status": "COMPLETED",
                "output": {"swapped_image_url": result_url}
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
    import sys
    print(f"[worker] Starting. Python={sys.version}, PORT={PORT}, PORT_HEALTH={PORT_HEALTH}", flush=True)

    # Run health check server on PORT_HEALTH in background thread
    health_thread = threading.Thread(
        target=lambda: health_app.run(host="0.0.0.0", port=PORT_HEALTH, debug=False, use_reloader=False),
        daemon=True
    )
    health_thread.start()

    # Run main API server on PORT
    print(f"[worker] Listening on 0.0.0.0:{PORT}", flush=True)
    app.run(host="0.0.0.0", port=PORT, debug=False)
