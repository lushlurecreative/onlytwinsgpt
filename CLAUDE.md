# OnlyTwins – Claude Code Project Context

## AUTONOMY (overrides default cautious behavior)
Shaun has granted permission for all implementation work in advance. Execute tasks fully, then report. Never ask "shall I proceed / want me to continue / is that OK / should I..." mid-task.

Stop ONLY for:
1. A product/business decision that can't be inferred from context
2. A destructive/irreversible prod action (drop tables, force-push, delete user data)
3. Something that literally requires Shaun's credentials or dashboard access

Shaun does not write code or run commands. Claude edits files, runs migrations, pushes to `main`. When Shaun must act (Stripe dashboard, Supabase SQL Editor, Vercel env vars), give plain-English numbered steps with exact values.

## ONE-BUG / ONE-OBJECTIVE DISCIPLINE
- At session start, read `docs/HANDOFF_MASTER.md` and the selected bug file in `docs/bugs/` FIRST.
- Work one objective at a time. No scope creep, no parallel cleanup, no speculative refactors.
- Fix root cause, not symptoms. Update the bug file + handoff when done.

## CANONICAL ROUTES
Before adding/linking/redirecting/refactoring any route or route-tied component, read `docs/CANONICAL_ROUTES_AND_COMPONENTS.md`. It wins over any conflicting code/doc. `/library` is the only content destination; `/vault`, `/training-vault`, `/gallery`, `/feed`, `/welcome` are NOT canonical.

## ANTI-TOKEN-WASTE
- Never run repo-wide image globs (`**/*.png`, `**/*.jpg`, etc.) or broad unfiltered file scans. Scope every search to the relevant directory, file type, or symbol.
- Prefer `Grep` with a path + glob/type filter over `Glob` over broad dir listings.
- Don't re-read large docs you've already read this session. Don't dump full file contents when a targeted range suffices.
- Don't spawn subagents for searches a scoped `Grep` can answer.
- Don't paste migration files, env dumps, or doc indexes into responses — link to them.

## HARD RULES (do not regress)
- Don't break billing chain: checkout → webhook → subscription provisioning.
- Webhook idempotency: `stripe_webhook_events` insert must come first.
- Never write to `subscriptions` table outside `app/api/billing/webhook/route.ts`.
- Don't invent schema columns — inspect `supabase/migrations/` first.
- Every DB change needs a migration file in `supabase/migrations/`.
- Don't break auth/session handling.
- One source of truth per domain. No parallel flows, no dead UI, no placeholder paths.
- Keep admin shell and customer shell separate (never share nav).
- No technical language in customer-facing copy (no Stripe IDs, status codes, RunPod refs).
- Visual assets Shaun provides: use `<img src=...>` as-is. Never substitute CSS/SVG/AI art.

## CODING / DEBUG RULES
- Modify existing flows; don't create parallel ones.
- Keep server-side enforcement for auth, billing, usage.
- Clear loading/error/success states on interactive elements.
- Update affected docs in `/docs` with every feature change.
- Debugging: mock locally first; cheap-mode GPU before production RunPod; check RunPod credit balance first on cryptic worker errors.
- Auto-retry transient failures; don't stall for input.

## BEFORE TOUCHING CRITICAL AREAS
- **DB code**: read `supabase/migrations/`, existing RPCs, RLS policies, route handlers hitting the same table.
- **Billing**: read `app/api/billing/checkout/route.ts`, `app/api/billing/webhook/route.ts`, `lib/stripe.ts`, `lib/package-plans.ts`, `lib/plan-entitlements.ts`.
- **Auth**: read `proxy.ts`, `app/auth/callback/page.tsx`, `app/admin/layout.tsx`, `lib/admin.ts`, `app/logout/`.

## DEPLOY
- State clearly whether SQL runs before or after code deploy. SQL blocks must be idempotent.
- Env vars: give exact names, values, and Vercel environment (Production / Preview / Development).
- Push to `main` auto-deploys via Vercel.

## PHASE
Phase A (Revenue Reliability) → Phase B. No new features until guest checkout, webhooks, provisioning, subscriptions, entitlements, and worker all verified in prod.

## REFERENCE DOCS (load only when relevant)
`docs/HANDOFF_MASTER.md` · `docs/bugs/` · `docs/CANONICAL_ROUTES_AND_COMPONENTS.md` · `docs/current-known-issues.md` · `docs/architecture.md` · `docs/database.md` · `docs/stripe-billing.md` · `docs/auth-flow.md` · `docs/generation-pipeline.md` · `docs/admin-routes.md` · `docs/ui-rules.md` · `docs/env-vars.md` · `docs/testing-checklist.md` · `docs/deployment.md` · `docs/master-build-backlog.md` · `docs/release-checklist.md`
