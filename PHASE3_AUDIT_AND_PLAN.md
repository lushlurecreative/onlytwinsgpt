# Phase 3: Homepage Integration Audit & Patch Plan

## Current Flow Analysis

### ✅ **What Exists**

| Component | File | Status | Purpose |
|-----------|------|--------|---------|
| **Upload Gate** | `components/UploadGate.tsx` | ✅ Works | Accepts 3 user images (blob URLs only) |
| **HomeClient** | `app/HomeClient.tsx` | ✅ Works | Orchestrates upload → processing → results |
| **Processing Screen** | `app/HomeClient.tsx` L80-144 | ✅ Works | Fake progress (no actual work) |
| **Scenario Grid** | `components/ScenarioGrid.tsx` | ✅ Works | Displays 20 gallery images (static) |
| **Preview API** | `app/api/preview/faceswap/route.ts` | ⚠️ Exists | Skeleton only; wrong RunPod format |
| **Gallery Data** | `lib/gallery-data.ts` | ✅ Works | 70+ curated gallery images |

### ❌ **What's Missing**

1. **Image Persistence**: Blob URLs vanish after upload (no Supabase upload)
2. **Worker Integration**: API doesn't call RunPod worker with correct format
3. **Target Templates**: No fixed 3 target images selected for swapping
4. **Result Display**: No component to show actual swapped outputs
5. **Logging**: No trace of upload → faceswap → result flow
6. **Failure States**: No graceful error handling or UI feedback

---

## Exact Files Currently Involved

### Upload Flow
- `components/UploadGate.tsx` (L18-30): `addFiles()` creates blob URLs
  - Issue: No persistence, no URL returned to parent
- `app/HomeClient.tsx` (L44-69): `startProcessing()` shows fake progress
  - Issue: Calls no API, just UI animation

### Worker Invocation (Skeleton)
- `app/api/preview/faceswap/route.ts` (L11-107): `callRunPodFaceSwapAsync()`
  - Issues:
    - Wrong RunPod format (uses `target_image`/`swap_image` instead of `user_photo_url`/`scenario_image_url`)
    - Expects `/run` endpoint (async submission)
    - Polls `/status/{jobId}` (doesn't match our worker endpoints)
    - No integration with HomeClient

### Gallery Display
- `components/ScenarioGrid.tsx` (L9-24): Displays 20 fixed gallery images
  - Could be modified to show swapped results OR create new component

### Gallery Data
- `lib/gallery-data.ts`: 70+ curated images
  - Select first 3 SFW images as fixed targets

---

## Patch Plan (Smallest Safe Path)

### **Phase 3a: Image Upload to Supabase** (10 lines)
Modify `components/UploadGate.tsx`:
- Import `uploadImageToSupabase()` (new helper)
- On "Reveal my AI scenarios" click:
  - Convert 3 blob URLs to Files
  - Upload to Supabase `uploads` bucket
  - Get public URLs
  - Pass URLs to `onComplete()`

### **Phase 3b: Select Fixed Target Templates** (3 lines)
Modify `lib/gallery-data.ts`:
- Export `const PREVIEW_TARGETS = [galleryItems[0], galleryItems[5], galleryItems[10]]`
- (Select 3 diverse SFW gallery images)

### **Phase 3c: Call Worker with Correct Format** (40 lines)
Rewrite `app/api/preview/faceswap/route.ts`:
- Accept POST: `{ userPhotoUrls: [url1, url2, url3], targetImageUrls: [url1, url2, url3] }`
- For each pair (user, target):
  - Call RunPod endpoint with correct format: `{ input: { type: "faceswap", user_photo_url, scenario_image_url } }`
  - Poll `/status/{jobId}` OR use synchronous endpoint
  - Collect 3 swapped URLs
- Return: `{ results: [{ targetId, swappedUrl, success, error }] }`
- Add logging at each step

### **Phase 3d: Wire HomeClient to API** (30 lines)
Modify `app/HomeClient.tsx`:
- In processing state: Call `/api/preview/faceswap` with 3 user URLs + 3 target URLs
- Show real progress (not fake timing)
- Store results in state
- Pass to display component

### **Phase 3e: Display Swapped Results** (50 lines)
Create `components/PreviewResults.tsx`:
- Accept: `{ results: Array<{ target, swapped, success }> }`
- Show 3 cards with:
  - Target scenario (left side)
  - Swapped user face (right side)
  - Fallback if swap failed (show target unchanged)
- Use BeforeAfterSlider or side-by-side layout

### **Phase 3f: Integrate into Results View** (5 lines)
Modify `app/HomeClient.tsx`:
- Replace ScenarioGrid with PreviewResults (only for preview flow)
- Keep "Subscribe for 20+ scenarios" message

---

## Exact Expected End-to-End Flow

```
User → UploadGate:
  1. Upload 3 photos (JPEG/PNG files)
  2. Click "Reveal my AI scenarios"
  3. UploadGate converts to blob → uploads to Supabase
  4. UploadGate returns 3 public URLs to HomeClient

HomeClient (Processing Screen):
  5. Shows fake progress (~3s) while preparing request
  6. Calls /api/preview/faceswap with:
     {
       userPhotoUrls: ["https://...", "https://...", "https://..."],
       targetImageUrls: ["https://...", "https://...", "https://..."]
     }

API (/api/preview/faceswap):
  7. Logs: "preview_request { user_count: 3, target_count: 3 }"
  8. For each (userUrl, targetUrl):
     - Logs: "faceswap_job_start { user_url, target_url, job_id }"
     - Calls RunPod: POST to /api/preview/faceswap with input format
     - Polls /status/{jobId} until COMPLETED
     - Logs: "faceswap_job_complete { job_id, output_url }"
  9. Collects 3 swapped URLs
  10. Logs: "preview_complete { success_count: 3, swapped_urls: [...] }"
  11. Returns results to HomeClient

HomeClient (Results):
  12. Hides processing, shows PreviewResults component
  13. Displays 3 before/after pairs
  14. Below: "Subscribe for 20+ scenarios every month"

UI States:
  - uploading: Show upload progress
  - generating: Show processing animation + real progress
  - ready: Show before/after sliders
  - failed: Show target image with error message
```

---

## Files to Change / Create

| File | Change | Lines | Risk |
|------|--------|-------|------|
| `components/UploadGate.tsx` | Add Supabase upload | +20 | Low (new code, isolated) |
| `app/HomeClient.tsx` | Wire API call | +30 | Low (contained to state) |
| `app/api/preview/faceswap/route.ts` | Rewrite for RunPod worker | ±60 | Medium (critical path) |
| `components/PreviewResults.tsx` | **Create** | ~80 | Low (new component) |
| `lib/gallery-data.ts` | Export PREVIEW_TARGETS | +5 | Low (const only) |
| `lib/supabase-helpers.ts` | Add uploadImageToSupabase | ~30 | Low (new helper) |

---

## What Remains to Verify After Deployment

### Pre-deployment Verification
1. ✅ Gallery data has 3 diverse SFW images selected
2. ✅ RunPod endpoint is running (check /ping)
3. ✅ Supabase storage bucket is accessible
4. ✅ SUPABASE_URL and SUPABASE_ANON_KEY are set in Vercel

### Post-deployment Verification (Manual Test)
1. **Upload phase**:
   - Upload 3 photos on homepage
   - Check browser console for blob URLs
   - Click "Reveal my AI scenarios"
   - Wait for processing screen

2. **Face swap phase**:
   - Check `/api/preview/faceswap` logs in Vercel
   - Verify RunPod endpoint received 3 requests (check RunPod logs)
   - Verify each request format matches worker expectations

3. **Results phase**:
   - Check if swapped images load
   - If any blank: check worker status in RunPod
   - If all blank: check Supabase upload URL format

4. **Failure modes**:
   - Unplug internet → should show error message
   - Stop RunPod worker → should show target images as fallback
   - Invalid image file → should show error with guidance

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Blob URL doesn't persist across async calls** | Upload to Supabase immediately, get public URL |
| **RunPod format mismatch** | Test exact request/response format before deploying |
| **3 concurrent swaps timeout** | Use Promise.all() with 60s timeout per request |
| **Supabase upload fails (auth/quota)** | Fall back to error message; user can retry |
| **Target images too large for swap** | Pre-select images, test with worker before deploy |

---

## Business Goal Preserved

✅ User uploads 3 photos
✅ Sees themselves in actual AI scenarios (via faceswap)
✅ Before paying anything
✅ Drives conversion to subscription

---

## Summary

**Phase 3 is a 6-file, ~260 line integration.**

All logic reuses the proven Phase 2 GPU worker. No new algorithms, no API switches. Just wiring:
1. Upload → Supabase
2. Supabase URLs → RunPod API
3. RunPod results → UI display
4. Graceful failure states

**Zero hard rule violations.** All changes minimal and isolated.

Ready to implement.
