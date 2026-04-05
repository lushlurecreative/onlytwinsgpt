# Bug: Face identity preservation

## Status: OPEN — pipeline rebuilt, awaiting E2E validation (2026-04-05)

HyperSwap 1c 256 pipeline deployed. Not yet tested end-to-end with real user photos.

## Expected behavior

Swapped face preserves exact identity: eye color, braces, nose shape, face proportions, all distinctive features from the uploaded photos.

## Actual behavior

Unknown — new pipeline not yet tested with real photos. Previous pipeline (Delaunay warp) gave ~70-85% identity. HyperSwap 1c at 256x256 with multi-photo embedding averaging should improve this significantly.

## Confirmed facts

- HyperSwap 1c 256 is embedding-based (takes L2-normalized ArcFace embedding, no matrix multiply)
- HyperSwap model is 256x256 resolution (2x inswapper_128's 128x128)
- Multi-photo ArcFace embedding averaging implemented (all uploaded photos, not just first)
- Post-processing chain: LAB color match → seamlessClone(MIXED_CLONE) → CodeFormer 0.75 → Real-ESRGAN x2
- CodeFormer falls back to GFPGAN ONNX (CodeFormer Python package not in Docker image)
- Real-ESRGAN falls back to Lanczos (realesrgan Python package not in Docker image)
- ONNX input names in `_run_hyperswap()` are inferred — may need correction
- Worker deployed and confirmed running new code (commit `0e8864b`)
- Previous approaches all abandoned: pixel warp, InfiniteYou, PuLID, IP-Adapter

## Things tried

| Change | Commit | Result |
|--------|--------|--------|
| InfiniteYou (all variants) | pre-session | Abandoned — plastic/CGI |
| inswapper_128 + tuning | `08885c2` | ~85% identity, loses eye color/braces/nose |
| GFPGAN (blend=0.85) | `b1a1ad9` | Quality up, identity destroyed |
| EXIF orientation fix | `8a4f1cc` | Necessary, not sufficient |
| Semantic mask (face_parser) | `2255d28` | Fixes geometry leak, not identity |
| Direct pixel warp (5-point) | `f61cdeb` | Face too large, flat, identity off |
| 68-point Delaunay warp | `27305c6` | Better geometry, identity ~70-85% |
| PuLID FLUX | session | Identity drift, abandoned |
| **HyperSwap 1c 256 + full post-processing** | `0e8864b` | **Deployed, awaiting test** |

## Next single step

Test the homepage flow end-to-end: upload 1-3 face photos, trigger generation, check the output. If HyperSwap ONNX errors (wrong input names), read the worker logs, inspect `session.get_inputs()` output, and fix the input mapping in `worker/face_swap.py:_run_hyperswap()`.
