"""
Supabase storage: download from uploads bucket, upload to model_artifacts or uploads.
Uses SUPABASE_SERVICE_ROLE_KEY only.
"""

import os
from typing import List, Optional

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = None


def get_supabase() -> Optional["Client"]:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key or not create_client:
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


def upload_to_uploads(local_path: str, storage_path: str, content_type: str = "image/jpeg") -> bool:
    """Upload file to uploads bucket (e.g. generated image)."""
    sb = get_supabase()
    if not sb:
        return False
    try:
        with open(local_path, "rb") as f:
            data = f.read()
        sb.storage.from_("uploads").upload(storage_path, data, file_options={"content-type": content_type})
        return True
    except Exception as e:
        print(f"Upload uploads error {storage_path}: {e}")
        return False
