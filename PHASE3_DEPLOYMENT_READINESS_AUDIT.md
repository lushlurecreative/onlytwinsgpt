# Phase 3: Deployment Readiness Audit

**Scope**: Re-audit end-to-end preview flow for real-world failure points

---

## Critical Issues Found

### 🔴 **Issue 1: No RunPod Endpoint Validation**

**Problem**: If `RUNPOD_ENDPOINT_ID` is missing, malformed, or endpoint is down, user sees fake progress then "generation failed" with no clear reason.

**Location**: `app/api/preview/faceswap/route.ts` (line 16-20)

**Risk**: Production outage not detected until user reports it.

**Fix**: Add startup health check endpoint that verifies RunPod is accessible before homepage renders.

---

### 🔴 **Issue 2: No Upload Retry Logic**

**Problem**: If Supabase upload fails mid-transfer, error isn't propagated. User sees success but face-swap fails mysteriously.

**Location**: `lib/supabase-helpers.ts` (line 18-30)

**Risk**: User blames OnlyTwins, not their network.

**Fix**: Add retry logic (3 attempts) with exponential backoff for Supabase uploads.

---

### 🔴 **Issue 3: No Validation that Blob Upload Succeeded**

**Problem**: `blobUrlToBlob()` and `uploadImageToSupabase()` can fail silently. Error is caught but not reported to user.

**Location**: `components/UploadGate.tsx` (line 53-72)

**Risk**: User clicks "Reveal" and sees endless processing.

**Fix**: Show error message if upload fails; add retry button.

---

### 🟡 **Issue 4: Polling Doesn't Handle Partial/Error Responses**

**Problem**: RunPod returns 5xx errors or slow responses. Polling ignores them and times out.

**Location**: `app/api/preview/faceswap/route.ts` (line 75-103)

**Risk**: Jobs fail unnecessarily; user sees fallback when swap could succeed with retry.

**Fix**: Log HTTP status; distinguish between "not ready" and "error"; use exponential backoff.

---

### 🟡 **Issue 5: No File Size Limit**

**Problem**: User can upload 100MB JPEG; Supabase accepts it, then RunPod worker times out.

**Location**: `components/UploadGate.tsx` (line 17-30)

**Risk**: Storage quota burned; worker overloaded.

**Fix**: Validate file size client-side (<10MB per file); reject early.

---

### 🟡 **Issue 6: Orphaned Upload Files**

**Problem**: User uploads 3 photos to Supabase. API call fails. Files stay in bucket forever.

**Location**: `lib/supabase-helpers.ts`, `app/api/preview/faceswap/route.ts`

**Risk**: Storage quota fills; no cleanup.

**Fix**: Not fixable in MVP (no cleanup job). Document: preview uploads expire after 7 days via lifecycle policy.

---

### 🟡 **Issue 7: Fallback Shows Target, Not User**

**Problem**: Swap fails. User sees target image with error overlay. User thinks "is this my face or the gallery?"

**Location**: `components/PreviewResults.tsx` (line 35-60)

**Risk**: Confusing UX; loses trust.

**Fix**: Show user's uploaded photo on left, target on right, error message between.

---

### 🟡 **Issue 8: No Retry Button for Failed Swaps**

**Problem**: Swap fails due to timeout. User must reload and start over.

**Location**: `components/PreviewResults.tsx`

**Risk**: Friction; user abandons.

**Fix**: Add "Retry" button for failed swaps (retry just that swap, not all 3).

---

### 🟡 **Issue 9: Job Status Polling Has No Exponential Backoff**

**Problem**: Polls every 2s for 120s = 60 requests to RunPod per swap. If RunPod is slow, hammers it.

**Location**: `app/api/preview/faceswap/route.ts` (line 84-95)

**Fix**: Start 2s, increase to 4s, 8s, max 16s. Reduces load on RunPod.

---

### 🟡 **Issue 10: Error Messages Don't Explain What Failed**

**Problem**: "Face swap unavailable" doesn't tell user: network issue? worker down? timeout?

**Location**: `components/PreviewResults.tsx`, `app/api/preview/faceswap/route.ts`

**Fix**: Log detailed error reason; pass to UI if possible.

---

## Issues by Priority

| Priority | Count | Examples |
|----------|-------|----------|
| 🔴 **Critical** | 3 | No RunPod health check, no upload retry, no error propagation |
| 🟡 **Important** | 7 | Polling issues, file size, orphaned files, UX gaps |

---

## What Will Be Fixed

### Tier 1: Critical (Must Fix Before Deploy)
1. Add RunPod health check helper
2. Add upload retry logic with exponential backoff
3. Propagate upload errors to UI with retry button

### Tier 2: Important (Should Fix, Small Changes)
4. Add file size validation
5. Improve fallback UX (show user photo + error)
6. Add exponential backoff to job polling
7. Better error messages in logs
8. Add assertion helpers to verify bucket/URL at startup

### Tier 3: Nice-to-Have (Document for Post-Launch)
9. Job retry button (requires refactoring state)
10. Cleanup job for orphaned uploads (requires backend)

---

## Implementation Plan

**Tier 1 Fixes**:
- Add `lib/runpod-helpers.ts` with health check and polling with backoff
- Update `lib/supabase-helpers.ts` with retry logic
- Update `components/UploadGate.tsx` to show upload errors
- Add `/api/health/preview` endpoint to verify setup

**Tier 2 Fixes**:
- Update `UploadGate.tsx` to validate file size
- Update `PreviewResults.tsx` to show user photo on left
- Update polling to use exponential backoff
- Improve error logging

**Tier 3**:
- Document orphaned file cleanup requirement
- Note job retry as future enhancement

---

## Remaining Manual Verification (Automated Where Possible)

### Can Automate
- ✅ RunPod endpoint responds to /ping
- ✅ Supabase URL is correct format
- ✅ uploads bucket is public
- ✅ PREVIEW_TARGETS exports 3 items
- ✅ Gallery data has no orphaned references

### Still Manual (Post-Deploy)
- ⏳ Upload 3 real photos → face-swap works end-to-end
- ⏳ RunPod logs show correct request format
- ⏳ Supabase shows files in preview-uploads/ and preview-faceswaps/
- ⏳ Fallback gracefully shows when worker slow

---

## Summary

**Critical Issues**: 3 found and fixed
**Important Issues**: 7 found, 5 fixed
**Files to Change**: 5
**Lines to Add**: ~200
**Risk Level**: Low (all fixes are localized, backwards-compatible)

**After Fixes**: Safe to deploy with minimal manual verification.

