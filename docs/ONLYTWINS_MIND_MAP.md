# OnlyTwins mind map — strategic structure

This is the single source of truth for **how OnlyTwins is shaped as a product and a
compute system**. Route-level detail lives in `docs/ARCHITECTURE.md`. Business rules
live in `CLAUDE.md`. This document exists to answer one question: _is the whole thing
still pointing in the right direction?_

Last revised: 2026-04-09

---

## 1. Business backbone — the one loop that matters

OnlyTwins exists to deliver this loop, end-to-end, for one paying customer, without
operator intervention. Everything else in the repo is support for this loop.

1. **Acquire** — landing + homepage hook preview → Stripe checkout
2. **Provision** — `checkout.session.completed` → profile; `customer.subscription.created` → subscription
3. **Train** — upload photos → LoRA train → `identity_models` v(n) `is_active=true`
4. **Generate** — recurring mix → FLUX inference + LoRA → storage
5. **Deliver** — `generation_outputs` + `posts` → customer `/library`

Phase A goal: prove this loop for one real paid customer. Nothing else is Phase A.

---

## 2. Customer journey (post-payment)

```
/thank-you  →  /auth/callback  →  /dashboard  →  /onboarding/creator  →  /upload
           →  /requests  →  /library
```

- `/thank-you` polls `/api/thank-you/session` until **both** profile and subscription are ready
- `/dashboard` is the shell and the launch point into training
- `/upload` requires ≥5 photos before training dispatches
- `/requests` sets the recurring generation mix (photos / videos / prompts)
- `/library` is the canonical content destination (supersedes older `/vault` naming)

Rule: no Stripe IDs, no RunPod terminology, no status codes anywhere customer-facing.

---

## 3. Training flow

```
/upload
  → uploads/{user}/...                                     (Supabase Storage)
  → training_jobs (pending)
  → lib/runpod.ts dispatch   { type: "training" }
  → serverless worker/app.py → _run_training → train_lora.py
  → FLUX.1-dev loaded 4-bit NF4, LoRA rank/alpha 16/32, 300 steps default
  → bf16 LoRA safetensors
  → uploads/models/{subject_id}/{training_job_id}/pytorch_lora_weights.safetensors
  → PATCH /api/internal/worker/training-jobs/{id}
  → identity_models v(n) is_active=true  (one active per subject)
```

**State:** working end-to-end. Live active model is **v6**, 37.4 MB. Training is the
most-proven path in the worker.

---

## 4. Generation flow

```
/requests  OR  /api/generation-requests
  → generation_requests
  → cron (process-customer-generation / monthly-customer-generation)
  → split into generation_request_lines → generation_jobs
  → lib/runpod.ts dispatch   { type: "generation" }
  → serverless worker/app.py → main.run_generation_job → generate_flux.py
  → FLUX.1-dev inference + LoRA
  → upload to uploads/
  → PATCH /api/internal/worker/generation-jobs/{id}
  → generation_outputs + posts  →  /library
```

**Active blockers:**
1. `generate_flux.py` loads FLUX unquantized → OOM on 24 GB RTX 4090. Fix: mirror
   `train_lora.py`'s `BitsAndBytesConfig(load_in_4bit=True, nf4, bf16)` transformer path.
2. `main.run_generation_job` only downloads the LoRA when `lora_model_reference`
   starts with `model_artifacts/`, but v6 is at `models/...`. Once (1) is fixed,
   identity will still be lost until this prefix check is widened.

The retry + rollup cascade (generation_jobs → generation_requests → identity_models,
plus usage credit refund and user notifications) is proven working this session and
should not be touched.

---

## 5. Compute split — the two RunPod surfaces

OnlyTwins runs **two separate RunPod compute surfaces**. Do not conflate them.

### A. Serverless endpoint  `bd5p04vpmrob2u`
Image `lushlurecreative/onlytwinsgpt-worker:latest`. Entry `worker/app.py`. Pay-per-job.
Cold-restart via `PATCH workersMax 2 → 0 → 2`.

| Branch       | Purpose                                | Status |
|--------------|----------------------------------------|--------|
| `faceswap`   | FaceFusion / Delaunay face swap        | Live — used by homepage hook |
| `training`   | FLUX LoRA training (4-bit NF4)         | Live — v6 active |
| `generation` | FLUX inference + LoRA                  | Entrypoint live, blocked on VRAM quantization |

### B. Persistent ComfyUI pod
Always-on. Used **only** by the homepage hook pipeline.

- Generates FLUX scene with a generic person
- Hands signed-URL image off to serverless `faceswap` branch
- Pinned versions: torch 2.4.1+cu118, numpy 1.26.4 — **do not touch**

**Homepage hook pipeline** = ComfyUI pod (scene) → serverless faceswap (identity) →
live preview on landing + lead sample generation. Identity fidelity ~70–85% via
68-point Delaunay warp; treated as an acquisition demo, not as paid-customer output.

---

## 6. Storage + model lifecycle

Single bucket: Supabase Storage `uploads`.

| Kind               | Path                                                                                       |
|--------------------|--------------------------------------------------------------------------------------------|
| Training photos    | `uploads/{user_id}/...`                                                                    |
| LoRA artifacts     | `uploads/models/{subject_id}/{training_job_id}/pytorch_lora_weights.safetensors`           |
| Generation outputs | `uploads/...` (written by worker, referenced by `generation_outputs.output_path`)          |
| Lead samples       | `uploads/leads/...` (referenced by `leads_sample_paths`)                                   |

Registry rules:
- `identity_models` — versioned LoRA rows per subject, exactly one `is_active=true`
- `generation_outputs` + `posts` — final customer-visible records
- **Nothing** writes `identity_models.is_active` except the worker training PATCH
- **Nothing** writes `subscriptions` except `app/api/billing/webhook/route.ts`

---

## 7. Lead engine (pre-payment loop, funnels into §1 step 1)

```
cron/daily-lead-scrape       → leads
cron/enqueue-lead-samples    → homepage hook pipeline (ComfyUI + serverless faceswap)
cron/send-outreach           → personalized using sample
reply inbox                  → admin qualification
admin payment link  OR  lead-attached checkout  → convert_lead_to_customer() RPC
```

Admin surface: **Leads tab** (list, sample preview, outreach, reply inbox, payment links).

---

## 8. Admin / ops surface

The admin shell exists for three things: **sell, serve, recover**. Rank new admin
features against these three; anything else is noise.

| Purpose | Primary surface                                           | What lives here |
|---------|-----------------------------------------------------------|-----------------|
| Sell    | `/admin/leads`                                            | Pipeline, samples, outreach, replies, payment links |
| Serve   | `/admin/customers` → `/admin/customers/[workspaceId]`     | Subscription, dataset + training, generations, assets, failures |
| Recover | `/admin/revenue`, `/admin/worker`, `/api/admin/ops/*`     | Stripe revenue, worker health, job_events, retry / cancel / mark-failed |

Secondary panels built and usable but not in the primary nav: subscriptions,
webhooks, analytics, settings, cost, watermark, automation. Keep built. Do not
promote unless operators open them weekly.

**System 4 (ops + reliability) — trust these, do not rebuild:**
- `job_events` table + UNIQUE callback dedup index
- Job reaper cascade → parent `generation_requests` and `identity_models`
- Usage credit refund on full request failure (negative `usage_ledger` entries)
- User notifications: `training_failed`, `generation_completed`, `generation_failed`
- `/api/admin/ops/*`: list, retry-job, cancel-job, mark-failed, job-events

---

## 9. Core vs side

**Core (blocks real revenue — Phase A):**
- Stripe provisioning chain (webhook race, plan key resolution, workspace split)
- Training flow (proven)
- Generation flow (blocked on FLUX VRAM quantization + LoRA prefix)
- `/library` delivery
- System 4 recovery tools

**Side (keep, do not prioritize until core is green):**
- Bitcoin checkout (no webhook handler — park until demand)
- Homepage hook identity fidelity beyond current 70–85%
- Video generation lines (currently skipped in processor)
- Secondary admin panels (analytics, cohorts, KPIs, churn, creator profiles)
- Phase D consent-first onboarding state machine

**Dead / remove on sight:**
- Any standalone Samples or Production admin page — samples live under Leads,
  production state lives under Customers detail
- Old `/vault` naming where `/library` is now canonical

---

## 10. Global rules

- Health indicator (R/Y/G) on every admin page
- Automation toggles only where an operator needs to pause a cron
- Customer UX never shows Stripe IDs, RunPod language, or status codes
- One source of truth per domain: Stripe = revenue, Supabase = identity + content, RunPod = compute
- Every `subscriptions` write goes through `app/api/billing/webhook/route.ts`
- Every `identity_models.is_active` write goes through the worker training PATCH
