# Bug: Generation 503

## Expected behavior

Generation API routes accept requests and dispatch jobs to RunPod when a user has an active subscription with generation entitlements.

## Actual behavior

All generation routes return HTTP 503 with `{ code: "GENERATION_ENGINE_DISABLED" }` if the `GENERATION_ENGINE_ENABLED` environment variable is not set to `"true"` in Vercel.

## Reproduction

1. Ensure `GENERATION_ENGINE_ENABLED` is unset or not `"true"` in Vercel Production
2. As an authenticated user with active subscription, POST to `/api/generation-requests` or `/api/generate-images`
3. Response: `{ ok: false, status: 503, error: "Generation engine is currently disabled.", code: "GENERATION_ENGINE_DISABLED" }`

## Error message

```
Generation engine is currently disabled.
```
Status: 503. Code: `GENERATION_ENGINE_DISABLED`.

Logged via `logGenerationEngineDisabled()` in `lib/generation-engine.ts`.

## Affected files

- `lib/generation-engine.ts` (lines 1-3: `isGenerationEngineEnabled()` — the gate)
- `lib/customer-generation.ts` (lines 109-116: returns 503 from `createCanonicalCustomerGenerationBatch()`)
- `lib/customer-generation-processor.ts` (lines 83-85, 174-176: checks before processing)
- `lib/generation-jobs.ts` (lines 67-69: checks before job creation)
- `lib/runpod.ts` (lines 127-129: checks before dispatch)
- `app/api/generation-requests/route.ts` (line 104: calls canonical intake)
- `app/api/generate-images/route.ts` (line 65: calls canonical intake)

## Confirmed facts

- `isGenerationEngineEnabled()` does: `(process.env.GENERATION_ENGINE_ENABLED ?? "").trim().toLowerCase() === "true"`
- There is no fallback, no `app_settings` lookup, no default — if the env var is missing, generation is off
- Multiple code paths independently check this function — all block on it
- This is by design (kill switch), but it must be explicitly enabled for production use

## Unverified assumptions

- Whether `GENERATION_ENGINE_ENABLED=true` is currently set in Vercel Production (last known status from 2026-03-18: NOT set)

## Things already tried

Nothing — this is a configuration issue, not a code bug. The env var needs to be set.

## Next single step

Check Vercel Production environment variables for `GENERATION_ENGINE_ENABLED`. If not set, set it to `true`.
