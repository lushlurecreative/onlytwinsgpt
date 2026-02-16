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
Authentication

Signup/login working

Email confirmation configured

/login works

/me works

Middleware protects private routes

Database

profiles table exists

RLS enabled

Auto-trigger creates profile row on signup

Storage

Private bucket: uploads

RLS policies enforce per-user folder isolation

Upload Route

/upload route exists

Upload client component exists

Middleware protects route

WHAT STILL NEEDS VERIFICATION

Confirm upload success

Confirm file appears in Supabase

Confirm signed URL works

Confirm file renders

WHAT IS NOT BUILT YET
Roles System

Creator vs Consumer distinction

Role-based access logic

Content Engine

posts table

Content linking to storage files

Feed rendering

Access gating logic

Monetization

Stripe integration

Subscription tiers

Webhooks

Payment verification

Content entitlement checks

Creator Dashboard

Post creation UI

Media management

Revenue display

Admin Tools

Moderation tools

User suspension

Content removal

PHASE STRUCTURE
Phase 1 – Infrastructure (Current)

Finish upload verification.

Phase 2 – Content Engine

Build posts table + feed + signed rendering.

Phase 3 – Monetization

Integrate Stripe + subscriptions + gating.

Phase 4 – Creator Tools

Analytics + dashboard refinement.

Phase 5 – Hardening & Scale

Security review + optimization.

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

We are currently between Phase A and Phase B:

Core upload/publish/visibility/feed flows are working.

Stripe scaffolding is implemented but final webhook/entitlement verification is still pending.

Immediate next execution step:

Finish Stripe end-to-end verification and confirm entitlement transitions in live flow.
