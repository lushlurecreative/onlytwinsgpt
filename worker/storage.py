"""
Supabase storage: download from uploads bucket or URL, upload to model_artifacts or uploads.
Uses SUPABASE_SERVICE_ROLE_KEY only.
"""

import os
from typing import List, Optional

try:
    import requests
except ImportError:
    requests = None

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = None


def download_from_url(url: str, dest_path: str, timeout: int = 30) -> bool:
    """Download one file from HTTP(S) URL to local path."""
    if not url or not url.strip().startswith("http"):
        print(f"[download] Invalid URL: {url}", flush=True)
        return False
    if not requests:
        print("[download] requests module not available", flush=True)
        return False
    try:
        clean_url = url.strip()
        print(f"[download] GET {clean_url[:120]}", flush=True)
        r = requests.get(clean_url, timeout=timeout)
        print(f"[download] status={r.status_code}, content-type={r.headers.get('content-type','?')}, length={len(r.content)}", flush=True)
        if r.status_code != 200:
            print(f"[download] error body: {r.text[:500]}", flush=True)
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            f.write(r.content)
        return True
    except Exception as e:
        print(f"[download] FAILED {url[:120]}: {e}", flush=True)
        return False


def get_supabase() -> Optional["Client"]:
    import sys
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key or not create_client:
        print(f"[storage] get_supabase FAILED: url={'SET' if url else 'MISSING'} key={'SET' if key else 'MISSING'} create_client={'OK' if create_client else 'MISSING'}", flush=True)
        sys.stdout.flush()
        return None
    return create_client(url, key)


def download_from_uploads(object_path: str, dest_path: str) -> bool:
    """Download one file from uploads bucket to local path."""
    sb = get_supabase()
    if not sb:
        return False
    try:
        data = sb.storage.from_("uploads").download(object_path)
        with open(dest_path, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print(f"Download error {object_path}: {e}")
        return False


def download_many_from_uploads(object_paths: List[str], dest_dir: str) -> List[str]:
    """Download files to dest_dir; return list of local paths that succeeded."""
    os.makedirs(dest_dir, exist_ok=True)
    local_paths = []
    for i, path in enumerate(object_paths):
        name = path.split("/")[-1] if "/" in path else path
        local = os.path.join(dest_dir, f"{i:04d}_{name}")
        if download_from_uploads(path, local):
            local_paths.append(local)
    return local_paths


def download_from_model_artifacts(storage_path: str, dest_path: str) -> bool:
    """Download one file from model_artifacts bucket to local path."""
    sb = get_supabase()
    if not sb:
        return False
    try:
        data = sb.storage.from_("model_artifacts").download(storage_path)
        with open(dest_path, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print(f"Download model_artifacts error {storage_path}: {e}")
        return False


def upload_to_model_artifacts(local_path: str, storage_path: str) -> bool:
    """Upload file to model_artifacts bucket. storage_path e.g. {subject_id}/lora.safetensors."""
    sb = get_supabase()
    if not sb:
        return False
    try:
        with open(local_path, "rb") as f:
            data = f.read()
        sb.storage.from_("model_artifacts").upload(storage_path, data, file_options={"content-type": "application/octet-stream"})
        return True
    except Exception as e:
        print(f"Upload model_artifacts error {storage_path}: {e}")
        return False


def upload_to_uploads(local_path: str, storage_path: str, content_type: str = "image/jpeg") -> str | None:
    """Upload file to uploads bucket (e.g. generated image). Returns public URL or None."""
    import sys
    print(f"[storage] upload_to_uploads: path={storage_path} local={local_path} size={os.path.getsize(local_path) if os.path.exists(local_path) else 'MISSING'}", flush=True)
    sys.stdout.flush()
    sb = get_supabase()
    if not sb:
        print("[storage] upload_to_uploads: FAILED get_supabase returned None", flush=True)
        sys.stdout.flush()
        return None
    try:
        with open(local_path, "rb") as f:
            data = f.read()
        print(f"[storage] upload_to_uploads: uploading {len(data)} bytes to uploads/{storage_path}", flush=True)
        sys.stdout.flush()
        resp = sb.storage.from_("uploads").upload(storage_path, data, file_options={"content-type": content_type})
        print(f"[storage] upload_to_uploads: upload response={resp}", flush=True)
        sys.stdout.flush()
        # Construct public URL
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
        if not supabase_url:
            print("[storage] upload_to_uploads: FAILED supabase_url empty after upload", flush=True)
            sys.stdout.flush()
            return None
        public_url = f"{supabase_url}/storage/v1/object/public/uploads/{storage_path}"
        print(f"[storage] upload_to_uploads: OK url={public_url}", flush=True)
        sys.stdout.flush()
        return public_url
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[storage] upload_to_uploads: EXCEPTION {e}\n{tb}", flush=True)
        sys.stdout.flush()
        return None
