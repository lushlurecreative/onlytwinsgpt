#!/usr/bin/env bash
# backup-storage.sh — Thin wrapper around backup-storage.ts
#
# Runs the TypeScript mirror via npx tsx so you don't need a build step.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "$HERE/_lib.sh"

cd "$REPO_ROOT"

if ! command -v npx >/dev/null 2>&1; then
  err "npx not found — install Node.js"
  exit 1
fi

log "mirroring Supabase uploads bucket…"
BACKUP_ROOT="$BACKUP_ROOT" npx --yes tsx scripts/backup/backup-storage.ts
