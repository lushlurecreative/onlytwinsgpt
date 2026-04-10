#!/usr/bin/env bash
# backup-env.sh — Snapshot env vars and config pointers.
#
# What it captures:
#   • .env.local (copied as-is; contains secrets → locked 600)
#   • Vercel production env vars via `vercel env pull` (if CLI is linked)
#   • A manifest.md listing external services whose config lives outside
#     this repo (Supabase dashboard, RunPod, GitHub secrets, Stripe, etc.)
#
# What it does NOT do:
#   • Never writes secrets into the git-tracked repo.
#   • Never tries to scrape RunPod / Stripe / Supabase dashboards — those
#     are documented in the manifest instead.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "$HERE/_lib.sh"

KEEP="${KEEP_ENV:-14}"
OUT_DIR="$BACKUP_ROOT/env"
ensure_dir "$OUT_DIR"

cd "$REPO_ROOT"

# ── 1. Copy .env.local (the source of truth for local dev) ───────────────────
if [ -f "$REPO_ROOT/.env.local" ]; then
  cp "$REPO_ROOT/.env.local" "$OUT_DIR/env-local-$TIMESTAMP.env"
  chmod 600 "$OUT_DIR/env-local-$TIMESTAMP.env"
  ok "captured .env.local"
else
  warn ".env.local not found — skipped"
fi

# ── 2. Pull Vercel production env vars ───────────────────────────────────────
if command -v vercel >/dev/null 2>&1; then
  if [ -d "$REPO_ROOT/.vercel" ]; then
    VERCEL_OUT="$OUT_DIR/env-vercel-prod-$TIMESTAMP.env"
    if vercel env pull "$VERCEL_OUT" --environment=production --yes >/dev/null 2>&1; then
      chmod 600 "$VERCEL_OUT"
      ok "captured Vercel production env"
    else
      warn "vercel env pull failed — are you logged in? (run: vercel login)"
      rm -f "$VERCEL_OUT"
    fi
  else
    warn "no .vercel/ directory — run 'vercel link' once to enable vercel env pull"
  fi
else
  warn "vercel CLI not found — skipped Vercel env pull"
fi

# ── 3. Write a manifest of what's NOT in the dumps above ─────────────────────
MANIFEST="$OUT_DIR/manifest-$TIMESTAMP.md"
cat > "$MANIFEST" <<'EOF'
# OnlyTwins config backup manifest

This file lists config/state that lives outside the repo and outside the
automated env dumps. If any of these change, update them by hand or via
the service's own export mechanism.

## Vercel
- Env vars: captured to `env-vercel-prod-<ts>.env` (if CLI is linked)
- Preview/Development env: **not** pulled automatically. To pull:
    `vercel env pull <out>.env --environment=preview`
    `vercel env pull <out>.env --environment=development`
- Project settings (build command, domains, cron schedule in vercel.json):
  tracked in git as `vercel.json`.

## Supabase
- Project ref: derived from NEXT_PUBLIC_SUPABASE_URL in .env.local
- Schema: captured by `backup-db.sh` (schema-<ts>.sql.gz)
- Data:   captured by `backup-db.sh` (data-<ts>.sql.gz)
- Storage (uploads bucket): mirrored by `backup-storage.sh`
- Auth config (providers, email templates, redirects): **manual** — export
  from Supabase Dashboard → Authentication → Settings
- RLS policies: included in schema dump above
- Edge functions (if any): run `supabase functions list` + `supabase functions download <name>`
- Project API keys: in .env.local (already backed up)

## RunPod
- Endpoint ID + API key: in .env.local (already backed up)
- Template / container image definition: `.github/workflows/build-worker-image.yml`
  and `worker/Dockerfile` — tracked in git
- Serverless endpoint config (workers min/max, scaling): **manual export**
  — screenshot or copy values from the RunPod dashboard

## GitHub
- Repo + history: backed up via `backup-code.sh` git bundle + GitHub remote
- GitHub Actions secrets: **not exportable via API**. Keep a plaintext note
  of which secret names are set (values are stored on GitHub). Document in
  `docs/env-vars.md`.
- Branch protection rules: **manual** — screenshot from repo Settings.

## Stripe
- API keys + webhook secret: in .env.local (already backed up)
- Products / prices / webhooks / tax config: **live in Stripe**. Stripe
  has no first-party export for these. Document price IDs in
  `docs/stripe-billing.md` so they can be recreated.

## Local workstation
- .env.local          → captured
- .mcp.json           → contains API keys, gitignored, copy manually if needed
- ~/.claude           → Claude Code config, not project-scoped
EOF

ok "manifest → $(basename "$MANIFEST")"

prune_to_keep "$OUT_DIR" "env-local-*.env" "$KEEP"
prune_to_keep "$OUT_DIR" "env-vercel-prod-*.env" "$KEEP"
prune_to_keep "$OUT_DIR" "manifest-*.md" "$KEEP"

ok "env backup complete → $OUT_DIR"
