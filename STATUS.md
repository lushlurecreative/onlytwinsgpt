# ONLYTWINS – Build status vs master plan

**Reference:** [PROJECT_MASTER_PLAN.md](PROJECT_MASTER_PLAN.md)  
**Note:** A detailed mind map (layout, links, viewer experience) was mentioned but is not in the repo. This status is based on the master plan and the current codebase. If you have that spec in a file or can add it, we can align the “still to do” list to it.

---

## Executed (built and in codebase)

### Infrastructure & auth (Phase 1)
- [x] Authentication (signup, login, email confirmation)
- [x] `/login`, `/me`, middleware protecting private routes
- [x] Database: `profiles`, RLS, auto profile on signup
- [x] Storage: private `uploads` bucket, RLS per-user isolation
- [x] Upload route and upload client

### Content engine (Phase 2)
- [x] `posts` table (storage_path, caption, visibility, is_published, creator_id)
- [x] Feed: public feed (public posts only), creator feed by creatorId
- [x] Signed URLs for post media
- [x] Access gating: creator feed returns subscriber-only posts only when viewer has active subscription (`hasActiveSubscription`)

### Monetization (Phase 3)
- [x] Stripe: checkout route, webhook handler
- [x] Webhook updates `subscriptions` table (upsert on subscription events)
- [x] Entitlements: `/api/me/entitlements`, plan-based (plan key from Stripe price id)
- [x] Content entitlement: creator feed and vault use subscription/entitlement to gate access
- [x] Billing/checkout/portal pages and subscription list (e.g. `/start`)

### Creator-side (Phase 4 – partial)
- [x] Upload management (upload UI, vault)
- [x] Vault: sample management, consent/twin flow, generation requests
- [x] Generation requests: create request, approve, generate (RunPod), view assets
- [x] Plan-gated vault (entitlements: min/max samples, included images, etc.)
- [ ] **Not built:** Creator dashboard “summaries” and creator-facing billing/subscriber indicators (beyond what’s in vault/me)

### Admin
- [x] Admin layout and nav: **Leads | Customers | Revenue** (plus other admin pages)
- [x] Admin global health (worker status)
- [x] **Leads:** Scrape (YouTube, Reddit, Instagram, aggregators), ingest, upsert, enqueue samples, worker config, setup checklist
- [x] **Customers:** List by workspace, detail (subscription, dataset/training, generations, assets, failures)
- [x] **Revenue:** Metrics and subscription list
- [x] Other admin pages: subscriptions, cohorts, alerts, KPIs, churn, creator KPIs, webhook health/events, diagnostics, subjects, watermark, cost, generation-requests, automation, worker, settings
- [x] Redirects: `/admin` → `/admin/leads`; other admin routes normalized

### Automation (Phases E & F)
- [x] **Phase E – Training/Generation:** `training_jobs`, `generation_jobs`, RunPod dispatch, webhook completion, output ledger
- [x] **Phase F – Lead engine:** `leads` table, source/score, scrape, ingest (with 3+ image requirement for qualified), enqueue lead samples, `outreach_logs`, cron (daily scrape, enqueue samples, send outreach)
- [x] Consent boundary: training/generation for **customers** use `subjects.consent_status`; lead_sample jobs do not require subject consent

### Compliance / data
- [x] `subjects`: consent_status, consent_signed_at, identity_verified_at
- [x] Worker checks subject consent before training; lead_sample is consent-light (outreach → consent later)
- [x] Watermark logs for lead_sample and paid_output
- [x] No AI twin generation for real people before consent (customer flow is consent-first; leads get samples for outreach only)

### App runs on Vercel only
- [x] Docs (SETUP.md, README, .env.example) state: no local run required; set env in Vercel and deploy.

---

## Not executed / missing vs master plan

### Roles system (master plan “What is not built yet”)
- [ ] **Creator vs Consumer** distinction (no `role` or equivalent on profiles)
- [ ] **Role-based access logic** (e.g. creator-only vs consumer-only routes/pages)

### Phase D – Consent-first onboarding vault (full flow)
- [ ] **consent_records** table and secure document references (only `subjects` consent fields exist)
- [ ] **Identity verification status and approval gate** (column exists; no full approval workflow in UI)
- [ ] **Onboarding state machine** in UI: sourced → contacted → qualified → consented → onboarded → model_ready

### Phase C – Creator operations (remaining)
- [ ] **Stronger creator dashboard summaries** (revenue, subscriber counts, top content, etc.)
- [ ] **Creator-facing billing/subscriber indicators** (clear “you have X subscribers” / “billing” in creator area)

### Admin – moderation (master plan)
- [ ] **Moderation tools** (e.g. review reported content, flag users)
- [ ] **User suspension** (no suspend/unsuspend flow)
- [ ] **Content removal** (no admin “remove post” / takedown flow)

### Phase B – Entitlement hardening (verification)
- [ ] **Stripe end-to-end verification** (master plan: “Verify checkout redirect works end-to-end”, “Verify webhook updates subscriptions table”, “Verify entitlement transitions” in **live** flow)
- [ ] **Regression tests** for gating (e.g. public vs subscriber feed, canceled/expired handling)

### Phase G – Scale & risk
- [ ] Centralized logs and alert routing
- [ ] Queue observability and retry controls
- [ ] Abuse/anomaly detection
- [ ] DMCA/IP tooling (later)

### Mind map / layout (if provided separately)
- [ ] Align **site layout, links, and per-page viewer experience** to your mind map once it’s in the repo or pasted (navigation, what each link shows, CTAs, etc.).

---

## Summary: what’s done vs what’s left for “100% complete”

| Area | Done | Not done |
|------|------|----------|
| Auth & storage | ✅ | — |
| Posts & feed | ✅ | — |
| Stripe & subscriptions | ✅ | Live E2E verification + tests |
| Entitlement gating | ✅ | — |
| Creator vault & generation | ✅ | Dashboard summaries, billing/subscriber indicators |
| Admin (Leads, Customers, Revenue) | ✅ | Moderation, suspension, content removal |
| Lead engine & automation | ✅ | — |
| Consent/onboarding | Partial (subjects table) | consent_records, full state machine, identity approval |
| Roles (creator vs consumer) | ❌ | Full roles + RBAC |
| Phase G (observability, abuse) | ❌ | Logs, retries, abuse, DMCA |
| Mind map (layout/links/viewer) | — | Implement once spec is available |

**To reach 100% from the master plan:**  
(1) Add roles (creator/consumer) and RBAC.  
(2) Finish Phase D (consent_records, onboarding state machine, identity approval).  
(3) Add moderation (suspension, content removal).  
(4) Strengthen creator dashboard and creator-facing billing/subscriber info.  
(5) Verify Stripe + entitlement in production and add gating tests.  
(6) Add Phase G observability/retry/abuse (and later DMCA).  
(7) Align UI/navigation and per-page experience with your mind map once that spec is in the repo or provided.
