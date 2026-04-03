#!/usr/bin/env python3
"""
End-to-end test of the 2-step pipeline using live infrastructure:
  Step 1: FLUX scene generation via ComfyUI API (no InfiniteYou)
  Step 2: Face swap via RunPod serverless endpoint

Run from local machine:
    python worker/test_2step_e2e.py \
        --face faceswap_test_2.jpg \
        --comfyui https://uezkz34ux59drh-8188.proxy.runpod.net \
        --runpod-endpoint bd5p04vpmrob2u \
        --runpod-key YOUR_KEY
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import uuid

HEADERS = {"User-Agent": "OnlyTwins/1.0"}

SCENE_PROMPT = (
    "raw candid photo of a person at a tropical beach, golden hour, natural sunlight, "
    "ocean waves in background, real skin texture with pores, 85mm f/1.4 lens, "
    "film grain, unretouched, editorial photography"
)

NEGATIVE_PROMPT = (
    "blurry, deformed, ugly, bad anatomy, bad eyes, crossed eyes, disfigured, "
    "poorly drawn face, mutation, extra limb, cartoon, anime, drawing, painting"
)


def http_get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def http_post_json(url, data, headers_extra=None, timeout=120):
    body = json.dumps(data).encode()
    hdrs = {**HEADERS, "Content-Type": "application/json"}
    if headers_extra:
        hdrs.update(headers_extra)
    req = urllib.request.Request(url, data=body, headers=hdrs)
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def upload_image_to_comfyui(server, filepath):
    """Upload source image to ComfyUI /input directory."""
    name = f"test_{uuid.uuid4().hex[:8]}.png"
    with open(filepath, "rb") as f:
        img = f.read()
    boundary = uuid.uuid4().hex
    body = b""
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="image"; filename="{name}"\r\n'.encode()
    body += b"Content-Type: application/octet-stream\r\n\r\n"
    body += img
    body += b"\r\n"
    body += f"--{boundary}\r\n".encode()
    body += b'Content-Disposition: form-data; name="overwrite"\r\n\r\n'
    body += b"true\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{server}/upload/image",
        data=body,
        headers={**HEADERS, "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    result = json.loads(urllib.request.urlopen(req, timeout=60).read())
    return result.get("name", name)


def build_flux_only_prompt(scene_prompt):
    """
    FLUX-only workflow: NO InfiniteYou, no identity preservation.
    Just generates a scene with a generic person.
    Nodes: UNETLoader → DualCLIP → VAE → CLIPTextEncode → KSampler → VAEDecode → SaveImage
    """
    return {
        "1": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": "flux1-dev.safetensors",
                "weight_dtype": "fp8_e4m3fn_fast",
            },
        },
        "2": {
            "class_type": "DualCLIPLoader",
            "inputs": {
                "clip_name1": "t5xxl_fp8_e4m3fn.safetensors",
                "clip_name2": "clip_l.safetensors",
                "type": "flux",
            },
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": {"vae_name": "ae.safetensors"},
        },
        "7": {
            "class_type": "CLIPTextEncodeFlux",
            "inputs": {
                "clip": ["2", 0],
                "clip_l": scene_prompt,
                "t5xxl": scene_prompt,
                "guidance": 3.5,
            },
        },
        "8": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["2", 0],
                "text": NEGATIVE_PROMPT,
            },
        },
        "12": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "positive": ["7", 0],
                "negative": ["8", 0],
                "latent_image": ["13", 0],
                "seed": 42,
                "control_after_generate": "randomize",
                "steps": 20,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
            },
        },
        "13": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
        },
        "14": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["12", 0],
                "vae": ["3", 0],
            },
        },
        "15": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["14", 0],
                "filename_prefix": "flux_scene_test",
            },
        },
    }


def queue_and_wait(server, prompt_dict, timeout=300):
    """Queue prompt on ComfyUI, wait for completion, return history entry."""
    client_id = uuid.uuid4().hex
    result = http_post_json(f"{server}/prompt", {"prompt": prompt_dict, "client_id": client_id})

    if "node_errors" in result and result["node_errors"]:
        print("ERROR: ComfyUI rejected prompt:")
        for nid, err in result["node_errors"].items():
            print(f"  Node {nid}: {json.dumps(err, indent=2)}")
        sys.exit(1)

    prompt_id = result.get("prompt_id")
    if not prompt_id:
        print(f"ERROR: No prompt_id: {json.dumps(result, indent=2)}")
        sys.exit(1)

    print(f"  Queued: {prompt_id}")
    start = time.time()
    while time.time() - start < timeout:
        try:
            history = http_get(f"{server}/history/{prompt_id}")
            if prompt_id in history:
                entry = history[prompt_id]
                status = entry.get("status", {})
                if status.get("status_str") == "error":
                    print(f"ERROR: {json.dumps(status.get('messages', []))}")
                    sys.exit(1)
                if entry.get("outputs"):
                    return entry
        except Exception:
            pass
        time.sleep(3)
        elapsed = int(time.time() - start)
        if elapsed % 15 == 0 and elapsed > 0:
            print(f"  ...{elapsed}s")

    print(f"TIMEOUT after {timeout}s")
    sys.exit(1)


def download_comfyui_output(server, history_entry, output_path):
    """Download first output image from ComfyUI history."""
    outputs = history_entry.get("outputs", {})
    for node_id, node_out in outputs.items():
        images = node_out.get("images", [])
        for img_info in images:
            filename = img_info.get("filename")
            subfolder = img_info.get("subfolder", "")
            img_type = img_info.get("type", "output")
            params = urllib.parse.urlencode({
                "filename": filename,
                "subfolder": subfolder,
                "type": img_type,
            })
            url = f"{server}/view?{params}"
            req = urllib.request.Request(url, headers=HEADERS)
            data = urllib.request.urlopen(req, timeout=60).read()
            with open(output_path, "wb") as f:
                f.write(data)
            print(f"  Downloaded: {filename} -> {output_path} ({len(data) / 1024:.0f} KB)")
            return output_path

    print("ERROR: No output images found")
    sys.exit(1)


def call_runpod_faceswap(endpoint_id, api_key, source_face_b64, scenario_image_b64, timeout=120):
    """Call RunPod face swap endpoint with base64 images uploaded as data URIs or URLs."""
    # We need URLs the worker can fetch. Upload to a temp location or use data URIs.
    # RunPod worker expects URLs, not base64. Let's save locally and use the ComfyUI server as a proxy.
    # Actually, the RunPod worker downloads from URLs. We need accessible URLs.
    # Simplest: save the scenario image to a temp file, upload to ComfyUI, then construct a URL.
    pass


def call_runpod_faceswap_runsync(endpoint_id, api_key, user_photo_url, scenario_image_url, timeout=180):
    """Call RunPod serverless face swap with runsync."""
    url = f"https://api.runpod.ai/v2/{endpoint_id}/runsync"
    data = {
        "input": {
            "type": "faceswap",
            "user_photo_url": user_photo_url,
            "scenario_image_url": scenario_image_url,
        }
    }
    headers_extra = {"Authorization": f"Bearer {api_key}"}

    print(f"  Submitting to RunPod runsync...")
    body = json.dumps(data).encode()
    hdrs = {**HEADERS, "Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    req = urllib.request.Request(url, data=body, headers=hdrs)

    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        result = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        print(f"  RunPod HTTP error {e.code}: {error_body[:300]}")
        return None

    if result.get("status") == "COMPLETED":
        output = result.get("output", {})
        return output.get("image_base64")

    # Async — poll
    job_id = result.get("id")
    if job_id and result.get("status") in ("IN_QUEUE", "IN_PROGRESS"):
        print(f"  Job {job_id} queued, polling...")
        start = time.time()
        while time.time() - start < timeout:
            try:
                status_url = f"https://api.runpod.ai/v2/{endpoint_id}/status/{job_id}"
                status_req = urllib.request.Request(status_url, headers={**HEADERS, "Authorization": f"Bearer {api_key}"})
                status_resp = json.loads(urllib.request.urlopen(status_req, timeout=30).read())
                if status_resp.get("status") == "COMPLETED":
                    return status_resp.get("output", {}).get("image_base64")
                if status_resp.get("status") == "FAILED":
                    print(f"  Job FAILED: {status_resp.get('error', 'unknown')}")
                    return None
            except Exception as e:
                print(f"  Poll error: {e}")
            time.sleep(5)
        print(f"  Poll timeout after {timeout}s")
        return None

    print(f"  Unexpected result: {json.dumps(result)[:300]}")
    return None


def main():
    parser = argparse.ArgumentParser(description="E2E test: FLUX scene + FaceFusion swap")
    parser.add_argument("--face", required=True, help="Path to source face photo")
    parser.add_argument("--comfyui", required=True, help="ComfyUI server URL")
    parser.add_argument("--runpod-endpoint", required=True, help="RunPod endpoint ID")
    parser.add_argument("--runpod-key", required=True, help="RunPod API key")
    parser.add_argument("--output", default="test_e2e_result.jpg", help="Final output path")
    parser.add_argument("--scene-output", default="test_e2e_scene.png", help="Intermediate scene path")
    args = parser.parse_args()

    server = args.comfyui.rstrip("/")

    print(f"\n{'='*60}")
    print("2-Step Pipeline E2E Test")
    print(f"{'='*60}")
    print(f"  Face:     {args.face}")
    print(f"  ComfyUI:  {server}")
    print(f"  RunPod:   {args.runpod_endpoint}")
    print(f"  Output:   {args.output}")

    if not os.path.isfile(args.face):
        print(f"ERROR: Face file not found: {args.face}")
        sys.exit(1)

    # ── STEP 1: FLUX scene generation (no identity) ────────────────────
    print(f"\n[STEP 1] Generating FLUX scene (no identity)...")
    t1 = time.time()

    # Check server
    try:
        stats = http_get(f"{server}/system_stats")
        gpu = stats.get("devices", [{}])[0]
        vram = gpu.get("vram_total", 0) / (1024**3)
        print(f"  ComfyUI OK — VRAM: {vram:.1f} GB")
    except Exception as e:
        print(f"  ERROR: Cannot reach ComfyUI: {e}")
        sys.exit(1)

    # Build and queue FLUX-only prompt
    prompt = build_flux_only_prompt(SCENE_PROMPT)
    history = queue_and_wait(server, prompt)
    download_comfyui_output(server, history, args.scene_output)
    step1_time = round(time.time() - t1, 1)
    print(f"  Step 1 done in {step1_time}s")

    # ── Make the generated scene accessible via URL ─────────────────────
    # Upload the generated scene to ComfyUI's input so it has a URL
    # Actually, we can construct the URL directly from the output
    outputs = history.get("outputs", {})
    scene_url = None
    for node_out in outputs.values():
        for img_info in node_out.get("images", []):
            filename = img_info.get("filename")
            subfolder = img_info.get("subfolder", "")
            img_type = img_info.get("type", "output")
            params = urllib.parse.urlencode({
                "filename": filename,
                "subfolder": subfolder,
                "type": img_type,
            })
            scene_url = f"{server}/view?{params}"
            break
        if scene_url:
            break

    if not scene_url:
        print("ERROR: Could not construct scene URL")
        sys.exit(1)

    # Upload source face to ComfyUI so it has a URL too
    face_name = upload_image_to_comfyui(server, args.face)
    face_url = f"{server}/view?{urllib.parse.urlencode({'filename': face_name, 'subfolder': '', 'type': 'input'})}"
    print(f"  Face uploaded as: {face_name}")

    # ── STEP 2: Face swap via RunPod ───────────────────────────────────
    print(f"\n[STEP 2] Face swapping via RunPod...")
    t2 = time.time()

    swap_b64 = call_runpod_faceswap_runsync(
        args.runpod_endpoint,
        args.runpod_key,
        face_url,
        scene_url,
        timeout=180,
    )

    step2_time = round(time.time() - t2, 1)

    if not swap_b64:
        print(f"  Face swap FAILED after {step2_time}s")
        print(f"  Scene image saved at: {args.scene_output}")
        print(f"  You can still inspect the FLUX output.")
        sys.exit(1)

    # Save final result
    with open(args.output, "wb") as f:
        f.write(base64.b64decode(swap_b64))
    output_kb = os.path.getsize(args.output) / 1024
    print(f"  Step 2 done in {step2_time}s")

    total = round(time.time() - t1, 1)
    print(f"\n{'='*60}")
    print(f"SUCCESS")
    print(f"  Scene (no identity):  {args.scene_output}")
    print(f"  Final (with face):    {args.output} ({output_kb:.0f} KB)")
    print(f"  Total time:           {total}s")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
