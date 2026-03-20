#!/usr/bin/env python3
"""
RunPod Load Balancer HTTP server for face-swap and other jobs.
Runs health check on PORT_HEALTH, main API on PORT.
"""

import os
import threading
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
    try:
        data = request.get_json() or {}
        input_data = data.get("input", {})
        job_type = input_data.get("type")

        if job_type == "faceswap":
            user_photo_url = input_data.get("user_photo_url")
            scenario_image_url = input_data.get("scenario_image_url")

            if not user_photo_url or not scenario_image_url:
                return jsonify({
                    "status": "FAILED",
                    "error": "Missing user_photo_url or scenario_image_url"
                }), 400

            result_url = do_face_swap(user_photo_url, scenario_image_url)
            if not result_url:
                return jsonify({
                    "status": "FAILED",
                    "error": "Face swap processing failed"
                }), 500

            return jsonify({
                "status": "COMPLETED",
                "output": {"swapped_image_url": result_url}
            }), 200

        return jsonify({
            "status": "FAILED",
            "error": f"Unknown job type: {job_type}"
        }), 400

    except Exception as e:
        return jsonify({
            "status": "FAILED",
            "error": str(e)
        }), 500


if __name__ == "__main__":
    # Run health check server on PORT_HEALTH in background thread
    health_thread = threading.Thread(
        target=lambda: health_app.run(host="0.0.0.0", port=PORT_HEALTH, debug=False, use_reloader=False),
        daemon=True
    )
    health_thread.start()

    # Run main API server on PORT
    app.run(host="0.0.0.0", port=PORT, debug=False)
