"""
Phase 1 real-world training intake preprocessing.

Takes raw customer camera-roll uploads (15–25 photos, mixed quality), detects faces,
matches against a reference identity embedding, rejects no-face / wrong-person /
too-small / blurry / duplicate frames, crops usable training tiles, and emits a
structured intake_report plus a filtered tile directory ready for LoRA training.

Designed to run:
  - On the worker before train_lora (see main.py wiring), or
  - Standalone CLI for smoke tests: `python preprocess_intake.py <input_dir> <output_dir>`

Hard requirements:
  - ≥ MIN_FILTERED_TILES accepted same-identity tiles after filtering, otherwise
    returns structured failure (dominant_ratio, counts_by_reason) for the UI.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

import cv2
import numpy as np

try:
    from PIL import Image
except ImportError as e:
    print(f"Install Pillow: {e}", file=sys.stderr)
    sys.exit(1)

try:
    from insightface.app import FaceAnalysis
except ImportError as e:
    print(f"Install insightface + onnxruntime: {e}", file=sys.stderr)
    sys.exit(1)


# ── Tunables (Phase 1 defaults) ────────────────────────────────────
MIN_FILTERED_TILES = 12
MIN_FACE_SHORT_SIDE = 96         # px; below this is "face too small"
BORDERLINE_FACE_SHORT_SIDE = 64  # px; between borderline and min → auto-upscale
MAX_FACE_TILE_UPSCALE_FACTOR = 4.0  # cap upscale from raw face crop → 512 tile
BLUR_LAPLACIAN_MIN = 40.0        # below = rejected as blurry
MAX_YAW_DEGREES = 45.0
IDENTITY_COSINE_THRESHOLD = 0.45
DOMINANT_IDENTITY_RATIO_REQUIRED = 0.70  # ≥70% of detected faces must match dominant
REFERENCE_EMBEDDING_TOP_K = 3   # build ref from top-3 highest-confidence frontal faces
PHASH_HAMMING_DUPE_THRESHOLD = 6  # pHash Hamming distance ≤ this → treat as dupe

# Crop tile sizes produced per accepted frame
FACE_TILE_SIZE = 512
UPPER_BODY_TILE_SIZE = 768

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


# ── Data types ─────────────────────────────────────────────────────

@dataclass
class FaceHit:
    bbox: tuple[int, int, int, int]  # x1, y1, x2, y2
    score: float
    yaw: float
    pitch: float
    embedding: np.ndarray
    short_side: int


@dataclass
class FileDecision:
    path: str
    decision: str  # "accepted" | "auto_fixed" | "rejected"
    reason: str | None
    detected_faces: int
    matched_face_index: int | None
    cosine_to_reference: float | None
    blur_laplacian: float | None
    face_short_side: int | None
    tiles_emitted: list[str] = field(default_factory=list)


@dataclass
class IntakeReport:
    accepted: int
    auto_fixed: int
    rejected: int
    filtered_tiles_total: int
    dominant_identity_ratio: float
    reference_embedding_sha1: str | None
    threshold_used: float
    min_filtered_tiles_required: int
    counts_by_rejection_reason: dict[str, int]
    per_file: list[dict[str, Any]]
    ready_for_training: bool
    failure_reason: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "accepted": self.accepted,
            "auto_fixed": self.auto_fixed,
            "rejected": self.rejected,
            "filtered_tiles_total": self.filtered_tiles_total,
            "dominant_identity_ratio": round(self.dominant_identity_ratio, 4),
            "reference_embedding_sha1": self.reference_embedding_sha1,
            "threshold_used": self.threshold_used,
            "min_filtered_tiles_required": self.min_filtered_tiles_required,
            "counts_by_rejection_reason": self.counts_by_rejection_reason,
            "per_file": self.per_file,
            "ready_for_training": self.ready_for_training,
            "failure_reason": self.failure_reason,
        }


# ── Rejection reasons (canonical enum) ─────────────────────────────

REASON_NO_FACE = "NO_FACE"
REASON_FACE_TOO_SMALL = "FACE_TOO_SMALL"
REASON_BLURRY = "BLURRY"
REASON_WRONG_PERSON = "WRONG_PERSON"
REASON_DUPLICATE = "DUPLICATE"
REASON_UNUSABLE_ANGLE = "UNUSABLE_ANGLE"
REASON_UNREADABLE = "UNREADABLE"


# ── FaceAnalysis loader (singleton) ────────────────────────────────

_ANALYSIS = None

def _get_analysis() -> FaceAnalysis:
    global _ANALYSIS
    if _ANALYSIS is not None:
        return _ANALYSIS
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    app = FaceAnalysis(name="buffalo_l", providers=providers)
    # det_size kept moderate — upstream photos are often 1024–2048 wide
    app.prepare(ctx_id=0, det_size=(640, 640))
    _ANALYSIS = app
    return app


# ── Perceptual hash (pHash) for near-dup detection ─────────────────

def _phash(img_bgr: np.ndarray, hash_size: int = 16) -> int:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    resized = cv2.resize(gray, (hash_size * 4, hash_size * 4), interpolation=cv2.INTER_AREA)
    dct = cv2.dct(np.float32(resized))
    dct_low = dct[:hash_size, :hash_size]
    med = np.median(dct_low)
    bits = (dct_low > med).flatten()
    val = 0
    for b in bits:
        val = (val << 1) | int(b)
    return val


def _hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


# ── Image IO ───────────────────────────────────────────────────────

def _list_images(folder: Path) -> list[Path]:
    out = []
    for p in sorted(folder.iterdir()):
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS:
            out.append(p)
    return out


def _load_bgr(path: Path) -> np.ndarray | None:
    try:
        img = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
        return img
    except Exception:
        return None


def _blur_score(img_bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _normalize(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    if n < 1e-9:
        return v
    return v / n


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(_normalize(a), _normalize(b)))


def _face_short_side(bbox: tuple[int, int, int, int]) -> int:
    x1, y1, x2, y2 = bbox
    return int(min(x2 - x1, y2 - y1))


def _estimate_yaw(face) -> float:
    # insightface's Face has `pose` = (pitch, yaw, roll) in degrees when pose model present
    pose = getattr(face, "pose", None)
    if pose is not None and len(pose) >= 2:
        return float(abs(pose[1]))
    # Fallback: 0 if no pose estimate
    return 0.0


def _estimate_pitch(face) -> float:
    pose = getattr(face, "pose", None)
    if pose is not None and len(pose) >= 1:
        return float(pose[0])
    return 0.0


# ── Face detection per image ───────────────────────────────────────

def _detect(img_bgr: np.ndarray) -> list[FaceHit]:
    app = _get_analysis()
    faces = app.get(img_bgr)
    hits: list[FaceHit] = []
    for f in faces:
        bbox = tuple(int(v) for v in f.bbox.astype(int).tolist())
        emb = getattr(f, "normed_embedding", None)
        if emb is None:
            emb = getattr(f, "embedding", None)
        if emb is None:
            continue
        emb = np.asarray(emb, dtype=np.float32)
        hits.append(FaceHit(
            bbox=bbox,
            score=float(getattr(f, "det_score", 0.0)),
            yaw=_estimate_yaw(f),
            pitch=_estimate_pitch(f),
            embedding=emb,
            short_side=_face_short_side(bbox),
        ))
    return hits


# ── Reference embedding construction ───────────────────────────────

def _build_reference(all_hits: list[tuple[Path, list[FaceHit]]]) -> np.ndarray | None:
    """Pick top-K highest-confidence frontal faces (one per file), average embeddings."""
    candidates: list[tuple[float, FaceHit]] = []
    for _path, hits in all_hits:
        if not hits:
            continue
        # Frontal only
        frontal = [h for h in hits if h.yaw <= MAX_YAW_DEGREES]
        if not frontal:
            continue
        frontal.sort(key=lambda h: (h.score, h.short_side), reverse=True)
        best = frontal[0]
        candidates.append((best.score * max(best.short_side, 1), best))
    if not candidates:
        return None
    candidates.sort(key=lambda t: t[0], reverse=True)
    top = [h.embedding for _s, h in candidates[:REFERENCE_EMBEDDING_TOP_K]]
    ref = np.mean(np.stack(top, axis=0), axis=0)
    return _normalize(ref)


# ── Crop + upscale ─────────────────────────────────────────────────

def _expand_bbox(bbox: tuple[int, int, int, int], img_w: int, img_h: int, factor: float) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = bbox
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    w, h = (x2 - x1) * factor, (y2 - y1) * factor
    nx1 = int(max(0, cx - w / 2))
    ny1 = int(max(0, cy - h / 2))
    nx2 = int(min(img_w, cx + w / 2))
    ny2 = int(min(img_h, cy + h / 2))
    return (nx1, ny1, nx2, ny2)


def _upper_body_bbox(face_bbox: tuple[int, int, int, int], img_w: int, img_h: int) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = face_bbox
    fw, fh = x2 - x1, y2 - y1
    cx = (x1 + x2) / 2.0
    top = int(max(0, y1 - fh * 0.6))
    bottom = int(min(img_h, y2 + fh * 3.0))
    half = max(fw, fh) * 2.2
    left = int(max(0, cx - half))
    right = int(min(img_w, cx + half))
    return (left, top, right, bottom)


def _crop_and_resize(
    img_bgr: np.ndarray,
    bbox: tuple[int, int, int, int],
    target: int,
    *,
    allow_upscale: bool,
    max_upscale: float,
) -> np.ndarray | None:
    x1, y1, x2, y2 = bbox
    if x2 <= x1 or y2 <= y1:
        return None
    crop = img_bgr[y1:y2, x1:x2]
    h, w = crop.shape[:2]
    if min(h, w) == 0:
        return None
    scale = target / float(min(h, w))
    if scale > 1.0:
        if not allow_upscale or scale > max_upscale:
            return None
    interp = cv2.INTER_CUBIC if scale >= 1.0 else cv2.INTER_AREA
    new_w, new_h = int(w * scale), int(h * scale)
    resized = cv2.resize(crop, (new_w, new_h), interpolation=interp)
    # Center-crop to target×target
    rh, rw = resized.shape[:2]
    sx = max(0, (rw - target) // 2)
    sy = max(0, (rh - target) // 2)
    out = resized[sy:sy + target, sx:sx + target]
    if out.shape[0] != target or out.shape[1] != target:
        out = cv2.resize(out, (target, target), interpolation=cv2.INTER_AREA)
    return out


# ── Main pipeline ──────────────────────────────────────────────────

def preprocess_folder(
    input_dir: Path,
    output_dir: Path,
    *,
    min_tiles: int = MIN_FILTERED_TILES,
    cosine_threshold: float = IDENTITY_COSINE_THRESHOLD,
) -> IntakeReport:
    """Run preprocessing end-to-end. Writes accepted tiles into output_dir/tiles/."""
    output_dir.mkdir(parents=True, exist_ok=True)
    tiles_dir = output_dir / "tiles"
    tiles_dir.mkdir(exist_ok=True)

    files = _list_images(input_dir)
    decisions: list[FileDecision] = []
    rejection_counts: dict[str, int] = {}

    # Pass 1: detect faces on every file
    detected: list[tuple[Path, np.ndarray, list[FaceHit], float]] = []
    for path in files:
        img = _load_bgr(path)
        if img is None:
            decisions.append(FileDecision(
                path=path.name, decision="rejected", reason=REASON_UNREADABLE,
                detected_faces=0, matched_face_index=None, cosine_to_reference=None,
                blur_laplacian=None, face_short_side=None,
            ))
            rejection_counts[REASON_UNREADABLE] = rejection_counts.get(REASON_UNREADABLE, 0) + 1
            continue
        blur = _blur_score(img)
        hits = _detect(img)
        detected.append((path, img, hits, blur))

    # Pass 2: build reference embedding from top-K frontal faces
    reference = _build_reference([(p, h) for (p, _img, h, _b) in detected])
    ref_sha = hashlib.sha1(reference.tobytes()).hexdigest() if reference is not None else None

    if reference is None:
        # No frontal faces anywhere → everything rejects
        for path, _img, hits, _blur in detected:
            decisions.append(FileDecision(
                path=path.name, decision="rejected", reason=REASON_NO_FACE,
                detected_faces=len(hits), matched_face_index=None, cosine_to_reference=None,
                blur_laplacian=None, face_short_side=None,
            ))
            rejection_counts[REASON_NO_FACE] = rejection_counts.get(REASON_NO_FACE, 0) + 1
        return IntakeReport(
            accepted=0, auto_fixed=0, rejected=len(decisions), filtered_tiles_total=0,
            dominant_identity_ratio=0.0, reference_embedding_sha1=None,
            threshold_used=cosine_threshold, min_filtered_tiles_required=min_tiles,
            counts_by_rejection_reason=rejection_counts,
            per_file=[asdict(d) for d in decisions],
            ready_for_training=False,
            failure_reason="No frontal faces detected in any photo.",
        )

    # Pass 3: per-file classify + crop
    accepted_count = 0
    auto_fixed_count = 0
    tile_count = 0
    seen_phashes: list[int] = []
    total_faces_detected = 0
    matched_faces = 0

    for path, img, hits, blur in detected:
        if not hits:
            decisions.append(FileDecision(
                path=path.name, decision="rejected", reason=REASON_NO_FACE,
                detected_faces=0, matched_face_index=None, cosine_to_reference=None,
                blur_laplacian=blur, face_short_side=None,
            ))
            rejection_counts[REASON_NO_FACE] = rejection_counts.get(REASON_NO_FACE, 0) + 1
            continue

        total_faces_detected += len(hits)

        # Pick the face with highest cosine to reference (handles group photos)
        scored = [(_cosine(h.embedding, reference), idx, h) for idx, h in enumerate(hits)]
        scored.sort(key=lambda t: t[0], reverse=True)
        best_cos, best_idx, best_hit = scored[0]

        if best_cos < cosine_threshold:
            decisions.append(FileDecision(
                path=path.name, decision="rejected", reason=REASON_WRONG_PERSON,
                detected_faces=len(hits), matched_face_index=None,
                cosine_to_reference=round(best_cos, 4),
                blur_laplacian=blur, face_short_side=best_hit.short_side,
            ))
            rejection_counts[REASON_WRONG_PERSON] = rejection_counts.get(REASON_WRONG_PERSON, 0) + 1
            continue

        matched_faces += 1

        if blur < BLUR_LAPLACIAN_MIN:
            decisions.append(FileDecision(
                path=path.name, decision="rejected", reason=REASON_BLURRY,
                detected_faces=len(hits), matched_face_index=best_idx,
                cosine_to_reference=round(best_cos, 4),
                blur_laplacian=blur, face_short_side=best_hit.short_side,
            ))
            rejection_counts[REASON_BLURRY] = rejection_counts.get(REASON_BLURRY, 0) + 1
            continue

        if best_hit.yaw > MAX_YAW_DEGREES:
            decisions.append(FileDecision(
                path=path.name, decision="rejected", reason=REASON_UNUSABLE_ANGLE,
                detected_faces=len(hits), matched_face_index=best_idx,
                cosine_to_reference=round(best_cos, 4),
                blur_laplacian=blur, face_short_side=best_hit.short_side,
            ))
            rejection_counts[REASON_UNUSABLE_ANGLE] = rejection_counts.get(REASON_UNUSABLE_ANGLE, 0) + 1
            continue

        # Face size gate with auto-upscale for borderline. Faces below
        # BORDERLINE are rejected outright; faces in [BORDERLINE, MIN) are
        # accepted and flagged as auto_fixed since the face tile will be
        # upscaled from a sub-MIN native crop.
        is_auto_fixed = False
        if best_hit.short_side < BORDERLINE_FACE_SHORT_SIDE:
            decisions.append(FileDecision(
                path=path.name, decision="rejected", reason=REASON_FACE_TOO_SMALL,
                detected_faces=len(hits), matched_face_index=best_idx,
                cosine_to_reference=round(best_cos, 4),
                blur_laplacian=blur, face_short_side=best_hit.short_side,
            ))
            rejection_counts[REASON_FACE_TOO_SMALL] = rejection_counts.get(REASON_FACE_TOO_SMALL, 0) + 1
            continue
        if best_hit.short_side < MIN_FACE_SHORT_SIDE:
            is_auto_fixed = True

        # Dedupe on pHash
        ph = _phash(img)
        is_dupe = False
        for prev in seen_phashes:
            if _hamming(ph, prev) <= PHASH_HAMMING_DUPE_THRESHOLD:
                is_dupe = True
                break
        if is_dupe:
            decisions.append(FileDecision(
                path=path.name, decision="rejected", reason=REASON_DUPLICATE,
                detected_faces=len(hits), matched_face_index=best_idx,
                cosine_to_reference=round(best_cos, 4),
                blur_laplacian=blur, face_short_side=best_hit.short_side,
            ))
            rejection_counts[REASON_DUPLICATE] = rejection_counts.get(REASON_DUPLICATE, 0) + 1
            continue
        seen_phashes.append(ph)

        # Emit face tile (always) + upper-body tile (when context allows).
        # Face tiles may upscale up to MAX_FACE_TILE_UPSCALE_FACTOR; upper-body
        # tiles never upscale (they'd smear body context).
        h_img, w_img = img.shape[:2]
        face_bbox = _expand_bbox(best_hit.bbox, w_img, h_img, factor=1.6)
        face_tile = _crop_and_resize(
            img, face_bbox, FACE_TILE_SIZE,
            allow_upscale=True, max_upscale=MAX_FACE_TILE_UPSCALE_FACTOR,
        )

        tiles_this_file: list[str] = []
        if face_tile is not None:
            face_name = f"{path.stem}__face.jpg"
            cv2.imwrite(str(tiles_dir / face_name), face_tile, [cv2.IMWRITE_JPEG_QUALITY, 95])
            tiles_this_file.append(face_name)
            tile_count += 1

        ub_bbox = _upper_body_bbox(best_hit.bbox, w_img, h_img)
        ubw, ubh = ub_bbox[2] - ub_bbox[0], ub_bbox[3] - ub_bbox[1]
        if ubw > best_hit.short_side * 2 and ubh > best_hit.short_side * 2:
            ub_tile = _crop_and_resize(
                img, ub_bbox, UPPER_BODY_TILE_SIZE,
                allow_upscale=False, max_upscale=1.0,
            )
            if ub_tile is not None:
                ub_name = f"{path.stem}__upper.jpg"
                cv2.imwrite(str(tiles_dir / ub_name), ub_tile, [cv2.IMWRITE_JPEG_QUALITY, 95])
                tiles_this_file.append(ub_name)
                tile_count += 1

        decision = "auto_fixed" if is_auto_fixed else "accepted"
        decisions.append(FileDecision(
            path=path.name, decision=decision, reason=None,
            detected_faces=len(hits), matched_face_index=best_idx,
            cosine_to_reference=round(best_cos, 4),
            blur_laplacian=blur, face_short_side=best_hit.short_side,
            tiles_emitted=tiles_this_file,
        ))
        if is_auto_fixed:
            auto_fixed_count += 1
        else:
            accepted_count += 1

    dominant_ratio = (matched_faces / total_faces_detected) if total_faces_detected > 0 else 0.0

    failure_reason: str | None = None
    if tile_count < min_tiles:
        failure_reason = (
            f"Only {tile_count} usable tiles after filtering "
            f"(min required: {min_tiles}). See counts_by_rejection_reason."
        )
    elif dominant_ratio < DOMINANT_IDENTITY_RATIO_REQUIRED and total_faces_detected >= 5:
        # Only enforce ratio when we have enough signal (≥5 detected faces)
        failure_reason = (
            f"Dominant identity ratio {dominant_ratio:.2f} below required "
            f"{DOMINANT_IDENTITY_RATIO_REQUIRED:.2f}. Upload contains too many non-matching faces."
        )

    report = IntakeReport(
        accepted=accepted_count,
        auto_fixed=auto_fixed_count,
        rejected=len(decisions) - accepted_count - auto_fixed_count,
        filtered_tiles_total=tile_count,
        dominant_identity_ratio=dominant_ratio,
        reference_embedding_sha1=ref_sha,
        threshold_used=cosine_threshold,
        min_filtered_tiles_required=min_tiles,
        counts_by_rejection_reason=rejection_counts,
        per_file=[asdict(d) for d in decisions],
        ready_for_training=(failure_reason is None),
        failure_reason=failure_reason,
    )

    (output_dir / "intake_report.json").write_text(json.dumps(report.to_dict(), indent=2))
    return report


# ── CLI ────────────────────────────────────────────────────────────

def _main() -> int:
    ap = argparse.ArgumentParser(description="Phase 1 training intake preprocessor")
    ap.add_argument("input_dir", type=Path, help="Folder of raw customer uploads")
    ap.add_argument("output_dir", type=Path, help="Destination for filtered tiles + report")
    ap.add_argument("--min-tiles", type=int, default=MIN_FILTERED_TILES)
    ap.add_argument("--threshold", type=float, default=IDENTITY_COSINE_THRESHOLD)
    args = ap.parse_args()

    if not args.input_dir.is_dir():
        print(f"Input dir not found: {args.input_dir}", file=sys.stderr)
        return 2

    t0 = time.time()
    report = preprocess_folder(
        args.input_dir, args.output_dir,
        min_tiles=args.min_tiles, cosine_threshold=args.threshold,
    )
    elapsed = time.time() - t0

    print(json.dumps({
        "accepted": report.accepted,
        "auto_fixed": report.auto_fixed,
        "rejected": report.rejected,
        "filtered_tiles_total": report.filtered_tiles_total,
        "dominant_identity_ratio": round(report.dominant_identity_ratio, 4),
        "ready_for_training": report.ready_for_training,
        "failure_reason": report.failure_reason,
        "counts_by_rejection_reason": report.counts_by_rejection_reason,
        "elapsed_sec": round(elapsed, 2),
    }, indent=2))

    print("\nPer-file decisions:")
    for d in report.per_file:
        line = f"  {d['decision']:>10}  {d['path']}"
        if d.get("reason"):
            line += f"  [{d['reason']}]"
        if d.get("cosine_to_reference") is not None:
            line += f"  cos={d['cosine_to_reference']}"
        if d.get("face_short_side") is not None:
            line += f"  face_px={d['face_short_side']}"
        print(line)

    return 0 if report.ready_for_training else 1


if __name__ == "__main__":
    sys.exit(_main())
