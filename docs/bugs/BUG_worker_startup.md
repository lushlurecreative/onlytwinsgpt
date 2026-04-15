# Bug: Worker container crash-loop — RunPod workers never become ready

## Expected behavior

RunPod Serverless workers pull the Docker image, run `warmup()`, and become `ready` to accept jobs.

## Actual behavior

Workers cycle between `initializing` → `throttled` → `initializing` endlessly. Completed/failed job counts never change. Workers never reach `ready` state. Container crashes during startup before RunPod handler starts.

## Confirmed facts

- **Both `c1c7089` and `359fc9d` images crash-loop.** This is NOT caused by the LoRA adapter name fix. The crash exists in all recent Docker images.
- **Crash pattern:** worker alternates `initializing` → `throttled` every ~60-90 seconds. "Throttled" is RunPod's cooldown after a crash. This was monitored for 20+ minutes with consistent pattern.
- **Previous working state (52 completed jobs):** Those jobs ran on workers that were already warm from a previous session. When workers were cycled (2026-04-13), new workers with the same images crash-loop.
- **Docker image:** `lushlurecreative/onlytwinsgpt-worker:latest` — 10.3 GB compressed. Built on `nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04`, Python 3.10.
- **RunPod endpoint:** `bd5p04vpmrob2u`, ADA_24 GPU (RTX 4090 24GB), 60 GB container disk, FlashBoot enabled.
- **Account:** $36.95 balance, not under minimum. Not a funding issue.
- **Container startup sequence:** `app.py` → `from face_swap import do_face_swap, warmup` → `warmup()` → `runpod.serverless.start()`.
- **No Python syntax errors** in any worker file.
- **Mock pipeline verified:** All non-GPU pipeline logic (DB state transitions, storage upload, post creation, output records, job events) works correctly in 2.3s without GPU.
- Workers scaled to 0 after diagnosis. Template restored to `latest` tag.

## Top 3 hypotheses for the crash

1. **InsightFace buffalo_l model download fails at runtime.** `warmup()` → `_get_face_app()` → `FaceAnalysis(name="buffalo_l")` triggers a ~300 MB download from GitHub. If GitHub blocks or rate-limits the download, InsightFace may crash with an unhandled error inside the library (below our try/except). This would restart the container each time.

2. **ONNX Runtime CUDA 12 incompatibility.** The Dockerfile installs `onnxruntime-gpu==1.17.1` with CUDA 12 wheels. If RunPod's GPU drivers were updated to a newer version that's incompatible with `onnxruntime-gpu 1.17.1`, any ONNX model load during warmup (gfpgan, face_occluder, etc.) would segfault/crash.

3. **Container OOM during warmup.** Loading FaceFusion ONNX models + PyTorch + numpy on a GPU machine may exceed available RAM, especially if the CUDA runtime takes a large chunk. The Docker image is 10.3 GB compressed (~20+ GB uncompressed).

## Fix approach

**Cannot diagnose further from API alone** — RunPod Serverless doesn't expose container logs. To identify the exact crash:

Option A: **Add a startup guard script** — replace `CMD ["python", "app.py"]` with a wrapper that catches and logs the crash, then sleeps to prevent restart. This lets us read logs via RunPod's pod log API.

Option B: **Test on a RunPod GPU Pod** (not serverless) — run the Docker image interactively with `docker run -it --gpus all` on a standard GPU pod. See the crash output directly.

Option C: **Minimize the image** — strip warmup to bare minimum (skip all model loading at startup). If the stripped image starts, add models back one by one to find the crashing one.

## Things already tried

| Attempt | Result |
|---|---|
| Check `359fc9d` image | Crash-loops (init → throttled cycle) |
| Rollback to `c1c7089` image | Same crash-loop — not a `359fc9d` regression |
| Python syntax check all worker files | All pass |
| Check RunPod balance | $36.95, not under minimum |
| Check Docker Hub image | 10.3 GB compressed, built successfully |
| Scale workers 0 → 1, 0 → 2 | Both crash-loop on any image tag |
| Cancel jobs + purge queue | Done, workers at 0 |
| Add startup try/except + 5-min sleep on crash | Committed `b1556fb`, pushed, awaiting Docker rebuild |

## Previous fixes (still valid, just can't be tested yet)

1. **FIXED (c1c7089):** FLUX held ~16GB VRAM after inference. PyTorch CUDA cache blocked FaceFusion. Job crashed at 32s.
2. **FIXED (b8ebc17):** `app.py` returned `{"status": "completed"}` even on internal failure. RunPod showed COMPLETED for failed jobs.
3. **FIXED (359fc9d):** `importlib.reload(main_mod)` caused diffusers to auto-name adapter `default_0` but `set_adapters()` referenced `default`.

## Next single step

Wait for Docker build of `b1556fb` to complete (~15 min). Set `workersMax=1`, wait for the worker to crash and enter the 5-minute sleep, then retrieve crash output via RunPod's pod log API or dashboard. The error message will identify which hypothesis is correct (InsightFace download, ONNX/CUDA mismatch, or OOM).

## Status: ACTIVE — startup guard deployed `b1556fb`, awaiting build + log capture (2026-04-14)
