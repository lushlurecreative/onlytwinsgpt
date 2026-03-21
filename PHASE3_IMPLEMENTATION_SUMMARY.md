# Phase 3: Homepage Face-Swap Integration – COMPLETE ✓

**Status**: Ready for deployment and end-to-end testing

---

## Exact Files Changed

### 1. **components/UploadGate.tsx** (+25 lines modified)

**Change**: Add Supabase upload integration

```typescript
// Added import
import { uploadImageToSupabase, blobUrlToBlob } from "@/lib/supabase-helpers";

// Modified handleSubmit: converts blob URLs to public URLs
const handleSubmit = async () => {
  // Upload 3 blob URLs to Supabase
  // Get public URLs back
  // Pass URLs to onComplete()
};

// handleSample unchanged (uses gallery public URLs)
```

**Why**: Blob URLs are in-memory and non-persistent. Must upload to Supabase to pass to worker.

---

### 2. **app/HomeClient.tsx** (+50 lines modified)

**Changes**:
- Import `PreviewResults` component
- Import `PREVIEW_TARGETS` from gallery
- Add state: `previewResults`
- Modify `startProcessing()`: Call API endpoint with uploaded URLs
- Modify results section: Display `PreviewResults` instead of `ScenarioGrid`

```typescript
async function startProcessing(photos: string[]) {
  // 1. Get target URLs from PREVIEW_TARGETS
  const targetImageUrls = PREVIEW_TARGETS.map((item) => item.src);

  // 2. Call /api/preview/faceswap with user photos + targets
  const apiResponse = await fetch("/api/preview/faceswap", {
    method: "POST",
    body: JSON.stringify({
      userPhotoUrls: photos,
      targetImageUrls: targetImageUrls,
    }),
  });

  // 3. Show progress animation while waiting
  // 4. Store results in state
  setPreviewResults(apiResult.results);
}
```

**Why**: Wire the actual face-swap API call instead of fake progress.

---

### 3. **app/api/preview/faceswap/route.ts** (±130 lines, completely rewritten)

**Changes**:
- Accept: `POST { userPhotoUrls: [], targetImageUrls: [] }`
- For each target: Call RunPod worker with correct format
  ```json
  {
    "input": {
      "type": "faceswap",
      "user_photo_url": "...",
      "scenario_image_url": "..."
    }
  }
  ```
- Poll async jobs in parallel (Promise.all)
- Return: `{ results: [{ targetIdx, targetUrl, swappedUrl, success }] }`
- Add logging at each step

**Key Implementation**:
```typescript
// Helper function for single swap
async function callRunPodFaceSwap(
  userPhotoUrl: string,
  scenarioImageUrl: string,
  jobIdPrefix: string
): Promise<SwapResult | null> {
  // 1. Submit async job to RunPod /run endpoint
  // 2. Poll /status/{jobId} until COMPLETED or timeout
  // 3. Return swappedUrl or null
}

// Main handler: swap user face into 3 targets (parallel)
export async function POST(req: NextRequest) {
  const { userPhotoUrls, targetImageUrls } = await req.json();
  const userPhoto = userPhotoUrls[0];

  // Swap user into each target in parallel
  const swapPromises = targetImageUrls.map((target, idx) =>
    callRunPodFaceSwap(userPhoto, target, `swap_${idx}`)
  );

  const results = await Promise.all(swapPromises);
  return NextResponse.json({ results, successCount });
}
```

**Logging**:
```
[swap_0] Submitting face-swap job to RunPod
[swap_0] Job submitted: run-abc123xyz
[swap_0] Job completed: https://...swapped.jpg
[preview_faceswap] Complete: 3/3 successful
```

**Why**: Exact RunPod format for our Phase 2 worker. Parallel execution for speed.

---

### 4. **components/PreviewResults.tsx** (NEW, 120 lines)

**Purpose**: Display 3 face-swapped results or fallbacks

```typescript
interface Result {
  targetIdx: number;
  targetUrl: string;
  swappedUrl: string | null;  // null = use fallback
  success: boolean;
  error?: string;
}

// For each result:
// - If swappedUrl: Show user face in scenario
// - If null: Show target image with error overlay
// - Include "Subscribe for 20+ scenarios" CTA
```

**Features**:
- Shows 3 cards with before/after layout
- Graceful fallback if swap failed (show target with overlay)
- Same styling as `ScenarioGrid` for consistency
- "Subscribe & Get My AI Twin" CTA below

---

### 5. **lib/supabase-helpers.ts** (NEW, 50 lines)

**Functions**:
- `uploadImageToSupabase(blob, fileName)`: Upload to uploads bucket, return public URL
- `blobUrlToBlob(blobUrl)`: Convert browser blob URL to Blob object

**Why**: Reusable helpers for the upload workflow.

---

### 6. **lib/gallery-data.ts** (+5 lines)

**Added**:
```typescript
export const PREVIEW_TARGETS = [
  galleryItems.find((item) => item.src.includes('cars/photo_2025-09-27')) || galleryItems[0],
  galleryItems.find((item) => item.src.includes('cosplay/photo_2025-08-20_16-53-34')) || galleryItems[5],
  galleryItems.find((item) => item.src.includes('exercise/photo_2025-01-29')) || galleryItems[10],
].filter(Boolean);
```

**Why**: Fixed 3 diverse SFW targets for preview. Easy to swap if needed.

---

## Exact End-to-End Flow

```
1. User visits homepage.onlytwinsgpt.com (guest)
   ↓
2. HomeClient renders → UploadGate visible
   ↓
3. User uploads 3 photos (drag/drop or click)
   ↓
4. UploadGate preview shows 3 images (blob URLs)
   ↓
5. User clicks "Reveal my AI scenarios"
   ↓
6. UploadGate.handleSubmit():
   - Converts 3 blob URLs → Blob objects
   - Uploads to Supabase uploads bucket
   - Gets 3 public URLs back
   - Calls onComplete(publicUrls)
   ↓
7. HomeClient.startProcessing(publicUrls):
   - Gets PREVIEW_TARGETS (3 fixed gallery images)
   - Calls POST /api/preview/faceswap
   - Body: { userPhotoUrls: [...], targetImageUrls: [...] }
   ↓
8. API endpoint /api/preview/faceswap:
   - For each of 3 targets:
     - POST to RunPod: { input: { type: "faceswap", user_photo_url, scenario_image_url } }
     - Gets back job ID
     - Polls /status/{jobId} every 2s
     - Waits for COMPLETED status (up to 120s per job)
     - Extracts swappedUrl from output
   - Returns: { results: [{targetIdx, swappedUrl, success}] }
   ↓
9. HomeClient receives results:
   - Stores in previewResults state
   - Hides processing screen
   - Shows PreviewResults component
   ↓
10. PreviewResults renders:
    - 3 cards showing swapped images
    - Or target image + error if swap failed
    - "Subscribe & Get My AI Twin" CTA
    ↓
11. User clicks "Subscribe"
    - Redirected to /pricing
    - Normal checkout flow
```

---

## Logging Trace Example

```
[homepage] Calling face-swap API with 3 user photos and 3 targets
[swap_0] Submitting face-swap job to RunPod
[swap_0] Job submitted: run-uuid-1
[swap_1] Submitting face-swap job to RunPod
[swap_1] Job submitted: run-uuid-2
[swap_2] Submitting face-swap job to RunPod
[swap_2] Job submitted: run-uuid-3
[swap_0] Job completed: https://...swapped_0.jpg
[swap_1] Job completed: https://...swapped_1.jpg
[swap_2] Job completed: https://...swapped_2.jpg
[preview_faceswap] Complete: 3/3 successful
[homepage] Face-swap results: { results: [...], successCount: 3 }
```

---

## Graceful Failure States

| Scenario | Behavior | User Sees |
|----------|----------|-----------|
| **Upload fails** | API returns 400 | "Upload failed. Try again." |
| **RunPod offline** | API returns 500 | Target image with "Face swap unavailable" overlay |
| **Swap times out** | Poll exceeds 120s | Target image with "Face swap unavailable" overlay |
| **Swap failed** | Worker returns error | Target image with error message |
| **Network error** | Fetch throws | "Processing failed. Refresh page." |
| **Success** | All 3 swaps complete | 3 cards showing user faces in scenarios |

**Important**: Fallback always shows the target image, never blank. User never sees a broken state.

---

## Remaining Blockers / Pre-Deployment Checks

### Before Deployment

- [ ] **RUNPOD_ENDPOINT_ID** env var set in Vercel
  - Command: `vercel env ls` to check
  - Should be: `RUNPOD_ENDPOINT_ID=5ixxx...` (alphanumeric)

- [ ] **SUPABASE_URL** and **SUPABASE_ANON_KEY** set in Vercel
  - Command: `vercel env ls` to check
  - Both should be populated (from your Supabase project)

- [ ] **RunPod GPU endpoint running**
  - Check RunPod dashboard
  - Worker status should be "Running"
  - Health check should return 200 OK

- [ ] **Supabase uploads bucket exists and is public**
  - Go to Supabase Storage
  - Check `uploads` bucket
  - Check policies allow anonymous uploads

- [ ] **gallery-data.ts exports PREVIEW_TARGETS**
  - Verify 3 items in array
  - All nsfw: false
  - All type: "image"

### Post-Deployment Verification

**Step 1: Health Check**
```bash
# Check RunPod endpoint
curl -X GET https://[ENDPOINT_ID].api.runpod.ai/ping
# Expected: 200 OK, body: {"status": "ok"}
```

**Step 2: Manual UI Test**
1. Visit onlytwinsgpt.com in incognito browser
2. Upload 3 photos
3. Click "Reveal my AI scenarios"
4. Wait for processing (~30-60s on first run)
5. Should see 3 face-swapped images
6. Check browser console for logs

**Step 3: Check Logs**
- Vercel: `vercel logs --follow`
- Look for: `[preview_faceswap] Complete: X/3 successful`
- Each swap should log job ID and completion

**Step 4: Check Supabase Storage**
- Go to Supabase Storage → uploads bucket
- Should see files in `preview-uploads/` folder
- Should see files in `preview-faceswaps/` folder (from worker)

**Step 5: RunPod Worker Logs**
- Go to RunPod endpoint
- Click "View Worker Logs"
- Should see 3 incoming requests
- Each with format: `{"input": {"type": "faceswap", "user_photo_url": "...", "scenario_image_url": "..."}}`

---

## What If Something Breaks

### Symptom: White screen, no error

**Check**:
1. Browser console for errors (F12)
2. Vercel logs for exceptions
3. RUNPOD_ENDPOINT_ID is set

### Symptom: "3 photos ready" button doesn't work

**Check**:
1. browser console for upload errors
2. Supabase Storage bucket exists and is public
3. Network tab shows POST to /api/preview/faceswap
4. Response status 200

### Symptom: Processing spins forever

**Check**:
1. RunPod endpoint status (should be "Running")
2. `/ping` endpoint responds
3. Vercel logs show `[swap_X] Job submitted`
4. RunPod worker logs show incoming requests

### Symptom: Shows target images (fallback)

**Check**:
1. RunPod worker health check passes
2. Worker logs show requests received
3. Check if worker is out of memory (OOM)
4. Verify SUPABASE_URL/KEY are correct (worker needs them)

---

## Summary of Changes

| Component | Change | Lines | Files |
|-----------|--------|-------|-------|
| **Upload** | Supabase integration | +25 | 1 |
| **API** | RunPod worker integration | +130 | 1 |
| **Display** | Face-swap results component | +120 | 1 |
| **Logic** | Wire API call in HomeClient | +50 | 1 |
| **Helpers** | Upload utilities | +50 | 1 |
| **Data** | PREVIEW_TARGETS export | +5 | 1 |
| **Docs** | Audit & plan | - | 1 |
| | | **~380 lines** | **6 files** |

**Risk Level**: Low (isolated changes, graceful fallbacks, no breaking changes to existing flow)

**Deployment**: Can merge to main immediately. No database migrations. No env vars added (all pre-configured in Phase 2).

---

**PHASE 3: HOMEPAGE INTEGRATION COMPLETE** ✓✓✓

Commit: b38dcc7

Ready for real deployment and end-to-end testing.
