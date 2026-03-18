# OnlyTwins – Claude Code Project Context

---

## Operator mode (how Shaun and Claude work together)

**Shaun does not write code, create files, or run commands.**

Claude operates in full implementation mode:
- Make all code changes directly in the repo
- Create and edit all files without asking Shaun to do it by hand
- When SQL is required, return the exact block to paste into Supabase SQL Editor
- When env vars are required, return exact variable names, values, and which Vercel environment (Production / Preview / Development)
- When testing is required, return plain-English click-by-click steps that anyone can follow
- When deploying, push to `main` via `git push origin main` or give exact Vercel deployment steps
- Never say "you'll need to..." for anything that can be done in code

When something must be done by Shaun (Stripe dashboard, Supabase SQL Editor, Vercel env vars), explain it in plain English with numbered steps — no technical jargon, no assumptions about technical knowledge.

## Autonomy rule (critical)

**Work through multi-step tasks from start to finish without stopping to ask permission.**

Do NOT pause between steps with phrases like "shall I proceed?", "want me to continue?", "ready for the next step?", or "should I go ahead?". Execute the full task, then report what was done.

Only stop mid-task if:
1. A product/business decision is required that cannot be inferred from context
2. A destructive or irreversible action is about to affect production (dropping tables, force-pushing, deleting real user data)
3. An action requires Shaun's credentials or dashboard access (Stripe, Vercel, Supabase SQL Editor)

Everything else: just do it and report at the end.

---

## Mission
OnlyTwins is a production AI content generation platform. It is not a demo. The product must feel premium, modern, AI-native, and operationally reliable.

Target: $80k–$150k/month. Automated acquisition → billing → AI training → content delivery.

## Core stack
- Next.js 16 App Router, React 19, TypeScript (strict)
- Supabase (Auth, Postgres with RLS, Storage)
- Stripe (subscriptions, checkout, webhooks)
- RunPod workers for generation/training
- Vercel for deployment (GitHub `main` → auto-deploy)
- Tailwind CSS v4, Framer Motion

## Core business flow
1. User subscribes and pays (Stripe checkout → webhook provisions account)
2. User logs in / lands in dashboard (`/dashboard`)
3. User completes onboarding (`/onboarding/creator` or `/onboarding/consumer`)
4. User uploads training photos (`/upload`, stored in Supabase Storage `uploads` bucket)
5. User sets recurring generation preferences (`/requests`)
6. System generates monthly content batch (cron + RunPod workers)
7. Results appear in vault (`/vault`)

## Admin flow
- Admin users (by email, `ADMIN_OWNER_EMAILS` env var) must be routed to `/admin`
- Admin must never see the normal customer shell
- Admin nav: Dashboard → Customers → Leads → Billing / Revenue
- Admin can manage customers, leads, billing/revenue, and operational tools
- Admin detection: `lib/admin.ts` → `isAdminUser()` — checked in `proxy.ts` and `app/admin/layout.tsx`

## Current phase
Phase A (Revenue Reliability) moving into Phase B.

**Exit criteria for Phase A:**
- Guest checkout works end-to-end in production
- Stripe webhooks returning 2xx consistently
- Workspace provisioning is automatic
- Subscriptions table reflects correct state
- Entitlement gating works correctly
- Worker processes jobs successfully

No new features until Phase A is verified complete.

## Hard rules
- Do not break billing (checkout → webhook → subscription provisioning chain)
- Do not break auth/session handling
- Do not break webhook idempotency (`stripe_webhook_events` insert must come first)
- Do not invent schema columns — read `supabase/migrations/` before writing DB code
- Never write to `subscriptions` table except from `app/api/billing/webhook/route.ts`
- Keep one source of truth per domain
- Do not leave dead UI or placeholder flows
- Do not expose technical language to customers (no Stripe IDs, no status codes, no RunPod references)
- Keep admin UX separate from customer UX
- Keep customer-facing copy clear and non-technical

## Coding rules
- Prefer modifying existing flows over creating parallel ones
- Reuse canonical routes/utilities when possible
- Keep server-side enforcement for auth, billing, and usage
- Use clear loading/error/success states on every interactive element
- For every feature change, also update any affected docs in /docs

## Before writing DB code
Always inspect:
- `supabase/migrations/` — current table columns and constraints
- Existing RPCs (`create or replace function` in migrations)
- Existing route handlers that touch the same table
- RLS policies on the table
Do not assume a column exists.

## Before writing billing code
Always inspect:
- `app/api/billing/checkout/route.ts`
- `app/api/billing/webhook/route.ts`
- `lib/stripe.ts`, `lib/package-plans.ts`, `lib/plan-entitlements.ts`
- `supabase/migrations/202602150004`, `202602150005`, `202602150006`, `202603100002`

## Before writing auth code
Always inspect:
- `proxy.ts` (middleware — single enforcement point)
- `app/auth/callback/page.tsx`
- `app/admin/layout.tsx`
- `lib/admin.ts`
- `app/logout/`

## UI rules
- Premium, modern, uncluttered
- No debug text in production UI
- No customer-facing raw Stripe language
- No redundant buttons
- No tiny fragmented boxes unless they are useful
- Admin and customer shells must never share nav components

## Testing rules
After any meaningful change, define exact manual test steps.
For billing/auth/generation changes, include end-to-end test paths.
See `docs/testing-checklist.md` for full test flows.

## Deployment rules
- Always state whether SQL must be run before or after the code deploy
- If SQL is required, return the exact SQL block (idempotent)
- If env vars are required, return exact names, values, and Vercel environments
- Push to `main` triggers Vercel auto-deploy
- See `docs/deployment.md` for full process

## Key known issues (do not regress)
1. **Plan key resolution** — `getPlanKeyForStripePriceId()` only reads env vars, but checkout stores price IDs in `app_settings`. If Stripe price ID env vars are not set, entitlements return null. Fix: ensure `STRIPE_PRICE_ID_*` env vars are set in Vercel.
2. **Thank-you race** — User lands on `/thank-you` before webhook fires. Page must poll `/api/thank-you/session` until `state=ready` before showing auth.
3. **Vault role elevation** — `app/vault/page.tsx` uses user-scoped client to set `profiles.role`. If RLS blocks this, role doesn't persist. Fix: use admin client for role elevation.
4. **Lead conversion duplicate** — When `lead_id` in metadata, lead is converted twice: once in `checkout.session.completed` (RPC) and once in `customer.subscription.created` (direct update).
5. **Workspace split** — Profile created in `checkout.session.completed`; subscription row created in `customer.subscription.created`. Dashboard can load between these two events with no subscription row.

Full details: `docs/current-known-issues.md`

## Documentation index
- `docs/project-overview.md` — what it is, plans, tech
- `docs/product-rules.md` — non-negotiable constraints
- `docs/architecture.md` — routes, middleware, lib files, cron
- `docs/database.md` — all tables, columns, migrations
- `docs/stripe-billing.md` — checkout, webhook, plans
- `docs/auth-flow.md` — login, logout, callback, admin routing
- `docs/generation-pipeline.md` — mix save, batch creation, job processing
- `docs/admin-routes.md` — all admin pages and APIs
- `docs/ui-rules.md` — shell separation, copy rules, components
- `docs/env-vars.md` — every env var with description
- `docs/testing-checklist.md` — manual test flows
- `docs/deployment.md` — deploy process, migrations, rollback
- `docs/how-to-work-with-shaun.md` — working style and communication
- `docs/master-build-backlog.md` — what is left to build
- `docs/current-known-issues.md` — active bugs and blockers
- `docs/release-checklist.md` — pre-deploy checks
