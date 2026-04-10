#!/usr/bin/env bash
# backup-code.sh — Snapshot the repo as both a git bundle and a source tarball.
#
# Creates two artefacts per run:
#   1. A git bundle (full history, restorable with `git clone`).
#   2. A source tarball (working tree minus node_modules, .next, etc).
#
# Keeps GitHub as the primary remote; this is a local "belt and braces" backup
# so the repo survives laptop loss, a force-push mistake, or a git corruption.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "$HERE/_lib.sh"

KEEP="${KEEP_CODE:-14}"
OUT_DIR="$BACKUP_ROOT/code"
ensure_dir "$OUT_DIR"

cd "$REPO_ROOT"

# ── 1. Git bundle — contains all refs + history ──────────────────────────────
BUNDLE="$OUT_DIR/onlytwins-$TIMESTAMP.bundle"
log "creating git bundle → $(basename "$BUNDLE")"
git bundle create "$BUNDLE" --all >/dev/null
ok "bundle written ($(du -h "$BUNDLE" | cut -f1))"

# ── 2. Source tarball — working tree snapshot ────────────────────────────────
TARBALL="$OUT_DIR/onlytwins-src-$TIMESTAMP.tar.gz"
log "creating source tarball → $(basename "$TARBALL")"
tar \
  --exclude='./node_modules' \
  --exclude='./.next' \
  --exclude='./.git' \
  --exclude='./.vercel' \
  --exclude='./coverage' \
  --exclude='./build' \
  --exclude='./worker/__pycache__' \
  --exclude='./output_*.png' \
  --exclude='./test_*.jpg' \
  --exclude='./faceswap_test_*.jpg' \
  -czf "$TARBALL" -C "$REPO_ROOT" . 2>/dev/null
ok "tarball written ($(du -h "$TARBALL" | cut -f1))"

# ── 3. Record HEAD + remote state so we know what each snapshot represents ──
MANIFEST="$OUT_DIR/onlytwins-$TIMESTAMP.manifest.txt"
{
  echo "timestamp: $TIMESTAMP"
  echo "head: $(git rev-parse HEAD)"
  echo "branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "remote: $(git remote get-url origin 2>/dev/null || echo 'none')"
  echo ""
  echo "dirty files:"
  git status --short || true
  echo ""
  echo "last 5 commits:"
  git log --oneline -5 || true
} > "$MANIFEST"

# ── 4. Prune old snapshots ───────────────────────────────────────────────────
prune_to_keep "$OUT_DIR" "onlytwins-*.bundle" "$KEEP"
prune_to_keep "$OUT_DIR" "onlytwins-src-*.tar.gz" "$KEEP"
prune_to_keep "$OUT_DIR" "onlytwins-*.manifest.txt" "$KEEP"

ok "code backup complete → $OUT_DIR"
