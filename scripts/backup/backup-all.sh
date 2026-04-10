#!/usr/bin/env bash
# backup-all.sh — Run all four backup layers in sequence.
#
# Exit codes:
#   0  all layers succeeded
#   >0 one or more layers failed (see stderr for which)
#
# Run manually:     ./scripts/backup/backup-all.sh
# Or schedule via:  ./scripts/backup/install-launchd.sh

set -u  # note: NOT -e — we want to attempt every layer even if one fails

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "$HERE/_lib.sh"

ensure_dir "$BACKUP_ROOT"

echo -e "${BOLD}${CYAN}OnlyTwins full backup${RESET}  $(date '+%Y-%m-%d %H:%M:%S')"
echo -e "${DIM}destination: $BACKUP_ROOT${RESET}"
echo ""

FAILED=()

run_layer() {
  local name="$1"
  local script="$2"
  echo -e "${BOLD}━━ $name ━━${RESET}"
  if bash "$script"; then
    ok "$name OK"
  else
    err "$name FAILED"
    FAILED+=("$name")
  fi
  echo ""
}

run_layer "code"    "$HERE/backup-code.sh"
run_layer "db"      "$HERE/backup-db.sh"
run_layer "storage" "$HERE/backup-storage.sh"
run_layer "env"     "$HERE/backup-env.sh"

# Update a pointer to the latest run for easy inspection
{
  echo "last_run: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "timestamp: $TIMESTAMP"
  echo "backup_root: $BACKUP_ROOT"
  echo "failed: ${FAILED[*]:-none}"
} > "$BACKUP_ROOT/LAST_RUN.txt"

if [ "${#FAILED[@]}" -gt 0 ]; then
  err "failed layers: ${FAILED[*]}"
  exit 1
fi

ok "all layers complete → $BACKUP_ROOT"
