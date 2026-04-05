# Debug Rules

## Session discipline

- One session = one objective.
- One bug = one session.
- Do not refactor during debugging.
- Do not make unrelated changes.
- Do not claim a fix without proof.

## Diagnosis process

- Identify the failing layer first (frontend / API / DB / worker / third-party).
- List top 3 likely causes before changing anything.
- Test one cause at a time.
- Make the smallest possible fix.

## Fix verification

- Report: files changed, tests run, and result.
- A fix is not confirmed until the exact reproduction steps pass.
- After 3 failed fix attempts, stop and reset with a fresh session.

## Layer identification checklist

| Symptom | Likely layer |
|---|---|
| UI shows wrong state | Frontend (component or client fetch) |
| API returns error status | API route handler |
| Data missing or wrong | DB query, RLS policy, or migration |
| Job never starts | RunPod dispatch (`lib/runpod.ts`) |
| Job starts but fails | Worker code (`worker/`) |
| Webhook not received | Stripe config or `proxy.ts` routing |
| Webhook received but no effect | Webhook handler (`app/api/billing/webhook/route.ts`) |
| Auth redirect loop | `proxy.ts` middleware or Supabase session |
| 503 on generation | `GENERATION_ENGINE_ENABLED` not set |

## What to capture in bug files

Each bug file in `docs/bugs/` must have:
- Exact reproduction steps
- Exact error message (copy-pasted, not paraphrased)
- Confirmed facts vs unverified assumptions (separated)
- Everything already tried and the result of each attempt
- One next step (not a list of ideas)
