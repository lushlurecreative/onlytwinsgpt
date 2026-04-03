#!/usr/bin/env python3
"""
OnlyTwins — Trigger one InfiniteYou generation via ComfyUI API.
Auto-discovers custom node input names. No browser needed.

Usage (on the pod):
    python trigger_comfyui.py --server http://localhost:8188 --image face.jpg

Usage (remote, if port 8188 is exposed):
    python trigger_comfyui.py --server https://<pod-id>-8188.proxy.runpod.net --image face.jpg

Options:
    --prompt "scene description"     Override the default scene prompt
    --output result.png              Where to save the output (default: output.png)
    --discover-only                  Just print discovered node info, don't generate
"""

import argparse
import json
import os
import sys
import time
import uuid
import urllib.request
import urllib.parse

# ─── Defaults ────────────────────────────────────────────────────────

DEFAULT_PROMPT = (
    "professional portrait photo at a tropical beach, golden hour lighting, "
    "ocean in background, natural skin texture, 85mm lens, shallow depth of field, photorealistic"
)
NEGATIVE_PROMPT = (
    "blurry, deformed, ugly, bad anatomy, bad eyes, crossed eyes, disfigured, "
    "poorly drawn face, mutation, extra limb, cartoon, anime, drawing, painting"
)

# ComfyUI types that represent node connections (not scalar widgets)
LINK_TYPES = frozenset({
    "MODEL", "CLIP", "VAE", "CONDITIONING", "LATENT", "IMAGE",
    "MASK", "CONTROL_NET", "STYLE_MODEL", "GLIGEN", "UPSCALE_MODEL",
    "SIGMAS", "NOISE", "GUIDER", "SAMPLER",
})


# ─── HTTP helpers (stdlib only — no pip dependencies) ────────────────

HEADERS = {"User-Agent": "OnlyTwins/1.0"}


def http_get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def http_post(url, data):
    body = json.dumps(data).encode()
    hdrs = {**HEADERS, "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=body, headers=hdrs)
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


def upload_image(server, filepath):
    """Upload source image to ComfyUI's /input directory as 'source_photo.png'."""
    name = "source_photo.png"
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


# ─── Node discovery via /object_info ─────────────────────────────────

def discover_inputs(server, class_type):
    """Get required + optional input defs for a node type."""
    data = http_get(f"{server}/object_info/{class_type}")
    info = data.get(class_type, {})
    return info.get("input", {}).get("required", {}), info.get("input", {}).get("optional", {})


def split_link_widget(inputs_dict):
    """
    Split an ordered dict of inputs into link-type names and widget-type names.
    Link-type inputs get node references ["node_id", output_index].
    Widget-type inputs get scalar values.
    """
    links, widgets = [], []
    for name, spec in inputs_dict.items():
        t = spec[0] if isinstance(spec, (list, tuple)) else str(spec)
        if isinstance(t, str) and t in LINK_TYPES:
            links.append(name)
        else:
            widgets.append(name)
    return links, widgets


def find_node_type(server, candidates):
    """Try each candidate name against /object_info, return first that exists."""
    for name in candidates:
        try:
            data = http_get(f"{server}/object_info/{name}")
            if name in data:
                return name
        except Exception:
            continue
    return None


# ─── Prompt builder ──────────────────────────────────────────────────

def build_prompt(server, image_name, scene_prompt):
    """
    Build ComfyUI API-format prompt.
    Standard nodes: hardcoded input names (stable across ComfyUI versions).
    InfiniteYou nodes: auto-discovered from /object_info.
    """

    # --- Discover InfiniteYou custom node input names ---
    print("\n  Discovering InfiniteYou node definitions...")

    # Try known name variants for each node type
    iy_map = {
        "IDLoader": ["IDEmbeddingModelLoader"],
        "IDExtract": ["ExtractIDEmbedding"],
        "InfuseLoader": ["InfuseNetLoader"],
        "InfuseApply": ["InfuseNetApply"],
    }

    # Also search all nodes if exact names fail
    all_nodes = None
    resolved = {}
    for key, candidates in iy_map.items():
        found = find_node_type(server, candidates)
        if not found:
            # Fallback: search all available node types
            if all_nodes is None:
                print("  Fetching full node list for search...")
                all_nodes = http_get(f"{server}/object_info")
            search_terms = {
                "IDLoader": ["idembedding", "id_embedding", "identityloader"],
                "IDExtract": ["extractid", "extract_id", "identityextract"],
                "InfuseLoader": ["infusenet", "infuse_net"],
                "InfuseApply": ["infuseapply", "infuse_apply", "infusenetapply"],
            }
            for node_name in all_nodes:
                lower = node_name.lower()
                if any(term in lower for term in search_terms.get(key, [])):
                    found = node_name
                    break
        if not found:
            print(f"  ERROR: Could not find node type for {key}")
            print(f"  Tried: {candidates}")
            if all_nodes:
                iy_like = [n for n in all_nodes if "infin" in n.lower() or "infuse" in n.lower() or "idembed" in n.lower()]
                print(f"  InfiniteYou-like nodes found: {iy_like}")
            sys.exit(1)
        resolved[key] = found

    # Get input definitions for each discovered node type
    iy = {}
    for key, class_type in resolved.items():
        req, opt = discover_inputs(server, class_type)
        # Merge required + optional for complete input picture
        all_inputs = dict(req)
        all_inputs.update(opt)
        link_names, widget_names = split_link_widget(all_inputs)
        req_link, req_widget = split_link_widget(req)
        opt_link, opt_widget = split_link_widget(opt)
        iy[key] = {
            "class_type": class_type,
            "link": link_names, "widget": widget_names,
            "req_link": req_link, "opt_link": opt_link,
        }
        print(f"  {class_type}:")
        print(f"    required links={req_link} widgets={req_widget}")
        if opt_link or opt_widget:
            print(f"    optional links={opt_link} widgets={opt_widget}")

    # --- Build the prompt dict ---
    prompt = {}

    # Node 1: UNETLoader
    prompt["1"] = {"class_type": "UNETLoader", "inputs": {
        "unet_name": "flux1-dev.safetensors",
        "weight_dtype": "fp8_e4m3fn_fast",
    }}

    # Node 2: DualCLIPLoader
    prompt["2"] = {"class_type": "DualCLIPLoader", "inputs": {
        "clip_name1": "t5xxl_fp8_e4m3fn.safetensors",
        "clip_name2": "clip_l.safetensors",
        "type": "flux",
    }}

    # Node 3: VAELoader
    prompt["3"] = {"class_type": "VAELoader", "inputs": {
        "vae_name": "ae.safetensors",
    }}

    # Node 4: LoadImage (uploaded source photo)
    prompt["4"] = {"class_type": "LoadImage", "inputs": {
        "image": image_name,
    }}

    # Node 5: IDEmbeddingModelLoader (all widgets, no links)
    d5 = iy["IDLoader"]
    vals5 = ["sim_stage1/image_proj_model.bin", 8, "CUDA", "640"]
    inputs5 = {}
    for i, name in enumerate(d5["widget"]):
        if i < len(vals5):
            inputs5[name] = vals5[i]
    prompt["5"] = {"class_type": d5["class_type"], "inputs": inputs5}

    # Node 6: ExtractIDEmbedding (all links, no widgets)
    # Links: slot 0-2 from node 5 outputs 0-2, slot 3 from node 4 output 0
    d6 = iy["IDExtract"]
    sources6 = [("5", 0), ("5", 1), ("5", 2), ("4", 0)]
    inputs6 = {}
    for i, name in enumerate(d6["link"]):
        if i < len(sources6):
            inputs6[name] = list(sources6[i])
    prompt["6"] = {"class_type": d6["class_type"], "inputs": inputs6}

    # Node 7: CLIPTextEncodeFlux (1 link: clip, 3 widgets: clip_l, t5xxl, guidance)
    prompt["7"] = {"class_type": "CLIPTextEncodeFlux", "inputs": {
        "clip": ["2", 0],
        "clip_l": scene_prompt,
        "t5xxl": scene_prompt,
        "guidance": 3.5,
    }}

    # Node 8: CLIPTextEncode (negative prompt)
    prompt["8"] = {"class_type": "CLIPTextEncode", "inputs": {
        "clip": ["2", 0],
        "text": NEGATIVE_PROMPT,
    }}

    # Node 9: EmptyImage (control placeholder — no pose guidance)
    prompt["9"] = {"class_type": "EmptyImage", "inputs": {
        "width": 864, "height": 1152, "batch_size": 1, "color": 0,
    }}

    # Node 10: InfuseNetLoader (1 widget: model path)
    d10 = iy["InfuseLoader"]
    inputs10 = {}
    if d10["widget"]:
        inputs10[d10["widget"][0]] = "sim_stage1/infusenet_sim_fp8e4m3fn.safetensors"
    prompt["10"] = {"class_type": d10["class_type"], "inputs": inputs10}

    # Node 11: InfuseNetApply
    # Map by discovered input NAME, not by position (required + optional order differs from workflow slot order)
    d11 = iy["InfuseApply"]
    inputs11 = {
        # Required links
        "positive": ["7", 0],      # text conditioning
        "id_embedding": ["6", 0],   # face identity embedding
        "control_net": ["10", 0],   # infusenet model
        "image": ["9", 0],          # control image (empty = no pose)
        # Optional links
        "negative": ["8", 0],       # negative conditioning
        "vae": ["3", 0],            # VAE for encoding
        # Widgets
        "strength": 1.0,
        "start_percent": 0.0,
        "end_percent": 1.0,
    }
    # Only include inputs that the node actually accepts
    valid_names = set(d11["link"] + d11["widget"])
    inputs11 = {k: v for k, v in inputs11.items() if k in valid_names}
    prompt["11"] = {"class_type": d11["class_type"], "inputs": inputs11}

    # Node 12: KSampler
    # FLUX uses guidance in the text encoder (CLIPTextEncodeFlux guidance=3.5),
    # not classifier-free guidance in the sampler. Set cfg=1.0 to avoid
    # positive/negative batch dimension mismatch.
    prompt["12"] = {"class_type": "KSampler", "inputs": {
        "model": ["1", 0],
        "positive": ["11", 0],
        "negative": ["11", 1],
        "latent_image": ["13", 0],
        "seed": 42,
        "control_after_generate": "randomize",
        "steps": 28,
        "cfg": 1.0,
        "sampler_name": "euler",
        "scheduler": "simple",
        "denoise": 1.0,
    }}

    # Node 13: EmptyLatentImage
    prompt["13"] = {"class_type": "EmptyLatentImage", "inputs": {
        "width": 1024, "height": 1024, "batch_size": 1,
    }}

    # Node 14: VAEDecode
    prompt["14"] = {"class_type": "VAEDecode", "inputs": {
        "samples": ["12", 0],
        "vae": ["3", 0],
    }}

    # Node 15: SaveImage
    prompt["15"] = {"class_type": "SaveImage", "inputs": {
        "images": ["14", 0],
        "filename_prefix": "onlytwins_hook",
    }}

    return prompt


# ─── Queue / poll / download ─────────────────────────────────────────

def queue_prompt(server, prompt_dict):
    """Submit prompt to ComfyUI and return prompt_id."""
    client_id = uuid.uuid4().hex
    result = http_post(f"{server}/prompt", {"prompt": prompt_dict, "client_id": client_id})

    # Check for validation errors
    if "node_errors" in result and result["node_errors"]:
        print("\nERROR: ComfyUI rejected the prompt:")
        for node_id, err in result["node_errors"].items():
            print(f"  Node {node_id}: {json.dumps(err, indent=2)}")
        sys.exit(1)

    prompt_id = result.get("prompt_id")
    if not prompt_id:
        print(f"ERROR: No prompt_id in response: {json.dumps(result, indent=2)}")
        sys.exit(1)
    return prompt_id


def wait_for_completion(server, prompt_id, timeout=600):
    """Poll /history until the prompt is done. Returns the history entry."""
    start = time.time()
    last_log = 0
    while time.time() - start < timeout:
        try:
            history = http_get(f"{server}/history/{prompt_id}")
            if prompt_id in history:
                entry = history[prompt_id]
                status = entry.get("status", {})

                # Check for error
                if status.get("status_str") == "error":
                    print(f"\nERROR during generation:")
                    msgs = status.get("messages", [])
                    for msg in msgs:
                        print(f"  {msg}")
                    sys.exit(1)

                # Check for completion (outputs present = done)
                if entry.get("outputs"):
                    return entry
        except Exception:
            pass

        time.sleep(3)
        elapsed = int(time.time() - start)
        if elapsed - last_log >= 15:
            print(f"  ...{elapsed}s elapsed")
            last_log = elapsed

    print(f"TIMEOUT after {timeout}s")
    sys.exit(1)


def download_output(server, history_entry, output_path):
    """Download the first generated image from the SaveImage node output."""
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
            dl_req = urllib.request.Request(url, headers=HEADERS)
            data = urllib.request.urlopen(dl_req, timeout=60).read()
            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(data)
            size_kb = len(data) / 1024
            print(f"  Downloaded: {filename} -> {output_path} ({size_kb:.0f} KB)")
            return output_path

    print("ERROR: No output images found in history entry")
    print(f"  Outputs: {json.dumps(outputs, indent=2)}")
    sys.exit(1)


# ─── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Trigger InfiniteYou generation via ComfyUI API")
    parser.add_argument("--server", required=True, help="ComfyUI URL, e.g. http://localhost:8188")
    parser.add_argument("--image", required=True, help="Path to source face photo")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT, help="Scene description")
    parser.add_argument("--output", default="output.png", help="Output file path")
    parser.add_argument("--discover-only", action="store_true", help="Print discovered node info and API payload, don't run")
    args = parser.parse_args()

    server = args.server.rstrip("/")

    print(f"\n{'='*60}")
    print("OnlyTwins — ComfyUI InfiniteYou Generation")
    print(f"{'='*60}")
    print(f"  Server:  {server}")
    print(f"  Image:   {args.image}")
    print(f"  Prompt:  {args.prompt[:70]}...")
    print(f"  Output:  {args.output}")

    # 1. Check server
    print("\n[1/5] Checking ComfyUI server...")
    try:
        stats = http_get(f"{server}/system_stats")
        gpu = stats.get("devices", [{}])[0]
        vram = gpu.get("vram_total", 0) / (1024**3)
        print(f"  Server OK — VRAM: {vram:.1f} GB")
    except Exception as e:
        print(f"  ERROR: Cannot reach {server}: {e}")
        print(f"  Make sure ComfyUI is running: cd /workspace/ComfyUI && python main.py --listen 0.0.0.0 --port 8188")
        sys.exit(1)

    # 2. Upload image
    print("\n[2/5] Uploading source image...")
    if not os.path.isfile(args.image):
        print(f"  ERROR: File not found: {args.image}")
        sys.exit(1)
    image_name = upload_image(server, args.image)
    print(f"  Uploaded as: {image_name}")

    # 3. Build prompt (auto-discovers InfiniteYou node inputs)
    print("\n[3/5] Building API prompt...")
    prompt_dict = build_prompt(server, image_name, args.prompt)

    if args.discover_only:
        print("\n--- Full API Prompt ---")
        print(json.dumps(prompt_dict, indent=2))
        print("\nDiscover-only mode. Exiting without generating.")
        return

    # 4. Queue
    print("\n[4/5] Queueing generation...")
    prompt_id = queue_prompt(server, prompt_dict)
    print(f"  Prompt ID: {prompt_id}")

    # 5. Wait + download
    print("\n[5/5] Waiting for generation...")
    t0 = time.time()
    history = wait_for_completion(server, prompt_id)
    elapsed = time.time() - t0
    print(f"  Generation completed in {elapsed:.1f}s")
    download_output(server, history, args.output)

    print(f"\n{'='*60}")
    print(f"DONE — Output: {os.path.abspath(args.output)}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
