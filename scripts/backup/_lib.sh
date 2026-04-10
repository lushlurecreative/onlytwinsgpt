#!/usr/bin/env bash
# Shared helpers for OnlyTwins backup scripts.
# Sourced by every backup-*.sh script. Do not run directly.

set -euo pipefail

# Backups live OUTSIDE the repo so they can never be committed by accident.
# Override with BACKUP_ROOT=/path env var if you want a different location.
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/onlytwins-backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Colours
BOLD='\033[1m'
DIM='\033[2m'
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
CYAN='\033[36m'
RESET='\033[0m'

log()  { echo -e "${CYAN}[backup]${RESET} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${RESET} $*"; }
warn() { echo -e "${YELLOW}[warn]${RESET} $*"; }
err()  { echo -e "${RED}[err ]${RESET} $*" >&2; }

# Load .env.local without echoing its contents. Parses KEY=VALUE lines and
# strips surrounding single/double quotes. Robust against values with ':' '@'
# '?' '&' (e.g. postgres URLs) because we never pass them through the shell.
load_env_local() {
  local envfile="$REPO_ROOT/.env.local"
  if [ ! -f "$envfile" ]; then
    err ".env.local not found at $envfile"
    return 1
  fi
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip blanks and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Must match KEY=...
    [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"
    val="${BASH_REMATCH[2]}"
    # Strip surrounding single or double quotes
    if [[ "$val" =~ ^\"(.*)\"$ ]] || [[ "$val" =~ ^\'(.*)\'$ ]]; then
      val="${BASH_REMATCH[1]}"
    fi
    export "$key=$val"
  done < "$envfile"
}

# Keep only the N newest files matching a glob, delete older.
# Usage: prune_to_keep <dir> <glob> <keep_count>
prune_to_keep() {
  local dir="$1"
  local pattern="$2"
  local keep="$3"
  if [ ! -d "$dir" ]; then return 0; fi
  # shellcheck disable=SC2012
  ls -1t "$dir"/$pattern 2>/dev/null | tail -n +"$((keep + 1))" | while read -r f; do
    rm -f "$f"
    log "pruned $(basename "$f")"
  done
}

ensure_dir() {
  mkdir -p "$1"
  chmod 700 "$1"
}
