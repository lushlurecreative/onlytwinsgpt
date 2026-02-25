ONLYTWINS – MASTER BUILD PLAN
PROJECT OVERVIEW

OnlyTwins is a secure, authenticated, monetized content platform.
Goal: Build a scalable AI-assisted creator platform capable of generating $80k–$150k/month.

This is not a demo app.
This is a production SaaS build.

CURRENT TECH STACK

Next.js (App Router)

Supabase (Auth + Postgres + Storage)

Supabase Storage (private bucket: uploads)

Middleware route protection

Cursor Agent managing code edits

CURRENT COMPLETED STATE
Core Product

Public marketing pages, pricing, creator feed, and authenticated dashboard routes are live.

Creator/consumer role model, subscriptions, leads pipeline, generation requests, and admin customers/leads/revenue views exist.

Billing + Onboarding

Stripe checkout route is live and currently uses:
`/welcome?session_id={CHECKOUT_SESSION_ID}` for plan checkout success redirect.

Webhook idempotency is implemented using `stripe_webhook_events` insert-first lock behavior.

`checkout.session.completed` provisioning path exists (Auth user create/reuse, profile upsert, optional lead conversion RPC path).

Welcome flow exists:
`/api/welcome/session` (session_id validation + readiness),
`/api/welcome/complete` (password/profile finalize),
`/welcome` page (poll + submit + sign in + redirect `/start`).

Admin

Admin primary UX is focused on Leads, Customers, Revenue.

Customer detail includes generation/vault-related operational sections.

Health API and global health indicator components exist.

WHAT STILL NEEDS VERIFICATION (LIVE)

End-to-end guest checkout in production:
Pricing -> Stripe -> `/welcome?session_id=...` -> password set -> auto sign-in -> `/start`.

Webhook delivery health:
`checkout.session.completed` and `customer.subscription.*` returning 2xx in Stripe dashboard.

RunPod execution path:
worker heartbeat healthy, jobs enqueue/process successfully.

WHAT IS STILL OPEN (OPERATIONS / POLISH)

Final launch hardening (alerting, retry visibility, abuse/rate controls).

Automation quality targets (lead volume and content quality constraints) need ongoing tuning.

Documentation cleanup to keep runbooks aligned with current flow.

PHASE STRUCTURE (ACTIVE)
Phase A – Revenue Reliability (Current)

Stabilize checkout, webhook provisioning, onboarding, and entitlement transitions in production.

Phase B – Entitlement and Access Hardening

Verify all paid/private boundaries and cancellation/expiry behavior.

Phase C – Creator + Ops UX Refinement

Improve dashboard/admin ergonomics without changing core flow.

Phase D – Scale + Monitoring

Queue observability, alert routing, and incident response playbooks.

AGENT DIRECTIVES

Always read this file before making structural decisions.

Do not invent features.

Do not skip verification steps.

Do not create duplicate folders.

Keep architecture clean and modular.

CURRENT POSITION

We are at: PHASE 1 – Upload Verification Step

Before building forward, we must confirm:

Upload works

Storage works

Signed URL works

File renders in browser

Then we move to PHASE 2.

CURSOR AGENT DIRECTIVE

You are responsible for:

Maintaining architecture clarity

Preventing folder misplacement

Providing exact file paths

Creating files directly when instructed

Avoiding placeholder logic

Avoiding duplicate env configs

Avoiding nested app/app errors

No assumptions

No shortcuts

No skipping verification

AUTOMATION ROADMAP (ORDERED EXECUTION PLAN)

This section supersedes older phase notes where conflicts exist.
Build order below is mandatory to avoid regressions and compliance risk.

CRITICAL OPERATING BOUNDARY

Do NOT generate AI twin samples of real people before explicit consent and rights grant.

All automation must be consent-first:

Lead discovery -> outreach -> consent + identity -> onboarding -> billing -> generation -> delivery.

HIGH-LEVEL BUSINESS TARGET

Long-term target is a fully automated creator platform, including:

Automated lead discovery

Automated outreach + qualification

Automated onboarding + consent vault

Automated model training + content production

Automated monetized distribution

AUTOMATION PHASES (REQUIRED ORDER)

Phase A – Core Revenue Reliability (Now)

Stabilize and verify existing monetization-critical flow:

Auth -> Upload -> Post -> Publish -> Visibility -> Feed -> Subscribe.

Required items:

Complete Stripe local setup (price id, webhook secret, service role key).

Verify checkout redirect works end-to-end.

Verify webhook updates subscriptions table.

Verify entitlement transitions from non-subscriber to subscriber.

Phase B – Entitlement Hardening

Enforce paid-access logic consistently at content fetch boundaries.

Required items:

Public feed returns only published + public.

Creator feed returns subscriber content only with active entitlement.

Handle canceled/expired status correctly.

Add regression tests for gating behavior.

Phase C – Creator Operations Productization

Expand creator-side productivity without architecture drift.

Required items:

Continue upload management improvements.

Add stronger creator dashboard summaries.

Add creator-facing billing/subscriber indicators.

Phase D – Consent-First Onboarding Vault

Introduce onboarding and legal gating before any model training.

Required items:

consent_records table and secure document references.

Identity verification status and approval gate.

Onboarding state machine:

sourced -> contacted -> qualified -> consented -> onboarded -> model_ready.

Phase E – Training/Generation Pipeline

Add AI production flow only after consent + billing foundation is stable.

Required items:

training_jobs table and queue.

RunPod handshake and job status polling.

generation_jobs table and output ledger.

Secure output processing pipeline (metadata sanitization and policy-compliant safety checks).

Phase F – Lead Engine Automation (Compliance-Gated)

Automate lead sourcing and outreach with strict safety constraints.

Required items:

leads table, lead source attribution, and scoring.

outreach_jobs table and message status tracking.

Conservative rate limiting and account safety controls.

No automated deepfake/twin generation before consent finalization.

Phase G – Scale, Monitoring, and Risk Controls

Operational hardening for sustained growth.

Required items:

Centralized logs and alert routing.

Queue observability and retry controls.

Abuse and anomaly detection.

DMCA/IP tooling and evidence logs as later enhancements.

CURRENT POSITION (UPDATED)

We are currently in Phase A (Revenue Reliability), moving into Phase B.

Core app + billing + onboarding architecture is implemented.

Immediate priority:
Confirm stable production behavior for the full guest checkout -> webhook -> welcome -> start flow and keep webhook deliveries green.
