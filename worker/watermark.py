"""
2-layer forensic watermark: Layer 1 robust (imwatermark dwtDct), Layer 2 fragile (optional).
Embed: payload -> hash (64 hex) -> embed 32 bytes in image; log hash in app.
Decode: extract bytes from image -> hash_hex; app looks up in watermark_logs.
"""
import os
import hashlib
import json
import tempfile
import requests

try:
    from imwatermark import WatermarkEncoder, WatermarkDecoder
    import cv2
    HAS_IWM = True
except ImportError:
    HAS_IWM = False

# 32 bytes = 256 bits embed (SHA256 hex is 64 chars; we embed first 32 bytes)
WM_BITS = 256

def build_payload(asset_type: str, lead_id=None, user_id=None, generation_job_id=None, campaign_id=None):
    import time
    import uuid
    return {
        "asset_type": asset_type,
        "lead_id": lead_id,
        "user_id": user_id,
        "generation_job_id": generation_job_id,
        "campaign_id": campaign_id,
        "timestamp_unix": int(time.time()),
        "nonce": str(uuid.uuid4()),
    }

def embed(image_path: str, payload: dict, output_path: str = None) -> str:
    """Embed watermark hash in image. Returns watermark_hash (hex). Caller logs to app."""
    payload_json = json.dumps(payload, sort_keys=True)
    watermark_hash = hashlib.sha256(payload_json.encode()).hexdigest()
    if not HAS_IWM:
        return watermark_hash
    try:
        bgr = cv2.imread(image_path)
        if bgr is None:
            return watermark_hash
        encoder = WatermarkEncoder()
        encoder.set_watermark("bytes", watermark_hash[:32].encode("utf-8"))
        bgr_encoded = encoder.encode(bgr, "dwtDct")
        out = output_path or image_path
        cv2.imwrite(out, bgr_encoded)
    except Exception:
        pass
    return watermark_hash

def decode(image_path: str) -> dict:
    """Extract watermark from image. Returns { watermark_hash (or 32-char prefix), tamper_status }."""
    if not HAS_IWM:
        return {"watermark_hash": None, "tamper_status": "unsupported"}
    try:
        bgr = cv2.imread(image_path)
        if bgr is None:
            return {"watermark_hash": None, "tamper_status": "not_found"}
        decoder = WatermarkDecoder("bytes", WM_BITS)
        wm_bytes = decoder.decode(bgr, "dwtDct")
        if wm_bytes and len(wm_bytes) >= 32:
            hash_prefix = wm_bytes[:32].decode("utf-8", errors="ignore")
            return {"watermark_hash": hash_prefix, "tamper_status": "ok"}
        return {"watermark_hash": None, "tamper_status": "not_found"}
    except Exception as e:
        return {"watermark_hash": None, "tamper_status": "error", "error": str(e)}

def decode_from_url(image_url: str) -> dict:
    """Download image from URL, decode, return same shape as decode()."""
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        try:
            r = requests.get(image_url, timeout=30)
            r.raise_for_status()
            f.write(r.content)
            f.flush()
            return decode(f.name)
        finally:
            try:
                os.unlink(f.name)
            except Exception:
                pass
