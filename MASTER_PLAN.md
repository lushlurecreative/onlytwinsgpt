# ONLYTWINS – MASTER PLAN

## 1. Core Objective

Build a consent-first, fully automated AI digital twin monetization engine that:

* Acquires creators automatically
* Converts them via Stripe
* Trains AI models
* Generates monetized content
* Enforces subscription limits
* Operates with minimal manual intervention
* Scales to $80k–$150k/month

This is a production SaaS system.

---

# 2. System Domains

## A) GLOBAL SYSTEM

Purpose: Automation control, health monitoring, idempotency, logging.

Includes:

* Global Health Indicator (R/Y/G)
* Automation Toggles
* Schedulers (scrape, outreach, reply poll, job reaper)
* Stripe Webhook Trigger
* system_events (append-only)
* audit_log (append-only)
* idempotency_key_store
* dedup_rules

---

## B) LEADS ENGINE (Pre-Payment State Machine)

Flow:
Scrape → Normalize → Dedupe → Score → Qualify → Sample → Outreach → Reply → Convert

Lead Status Enum:
new → qualified → rejected → sample_queued → sample_generated → outreach_queued → contacted → replied → converted

Includes:

* Targeting config
* Scraper
* Manual import
* Deduplication
* Scoring layer
* Qualification layer
* Sample generation (lead_sample jobs)
* Outreach system with throttling
* Manual override controls
* Conversion via Stripe checkout attribution (lead_id)

No separate Samples tab.

---

## C) CUSTOMERS ENGINE (Post-Payment State Machine)

Flow:
Stripe Success → Workspace → Dataset → Training → Generation → Vault

Workspace includes:

* Stripe IDs
* Plan
* Status (trial|active|past_due|canceled)
* Usage ledger
* Model registry

Dataset Intake:
Upload → Validation → dataset_status (not_ready|ready|invalid)

Training:
training_job → LoRA → model registry → active model version

Generation:
Entitlement check → generation_job → worker pipeline → upscale → watermark (post-upscale) → private storage → usage ledger append

Vault:
Private storage only
Signed URLs
Audit trail

Admin Controls:
Suspend
Comp Credits
Reset Usage
Force Retrain
Retry Failed Job
Cancel Job

---

## D) REVENUE OVERLAY

* Stripe webhook verification
* Idempotent event handling
* Plan-to-limit enforcement
* Revenue metrics (active, new, canceled, MRR)

---

# 3. Current Phase

Phase 1 – Revenue Reliability

Exit Criteria:

* Guest checkout works end-to-end in production.
* Stripe webhooks return 2xx consistently.
* Workspace provisioning is automatic.
* Subscription table reflects correct state.
* Entitlement gating works correctly.
* Worker processes jobs successfully.

No new features are to be built until Phase 1 is verified complete.

---

END OF MASTER PLAN
