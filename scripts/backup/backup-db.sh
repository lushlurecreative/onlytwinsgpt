#!/usr/bin/env bash
# backup-db.sh — Dump the Supabase Postgres database.
#
# Produces up to three files per run, all gzipped:
#   • schema-<ts>.sql.gz      — structure only (CREATE TABLE, RLS, functions)
#   • data-<ts>.sql.gz        — data only (COPY statements)
#   • roles-<ts>.sql.gz       — role grants (best-effort; skipped if permission denied)
#
# Strategy:
#   1. Parse DATABASE_URL from .env.local in Python (avoids shell-escape bugs
#      with passwords containing special characters).
#   2. Try `pg_dump` directly via PG* env vars.
#   3. If pg_dump fails because of a client/server version mismatch, tell the
#      user exactly which postgres@N to install via brew.
#   4. If auth fails, tell the user to rotate/refresh DATABASE_URL in Supabase
#      Dashboard → Settings → Database.
#
# No Docker required.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "$HERE/_lib.sh"

KEEP="${KEEP_DB:-14}"
OUT_DIR="$BACKUP_ROOT/db"
ensure_dir "$OUT_DIR"

load_env_local

if [ -z "${DATABASE_URL:-}" ]; then
  err "DATABASE_URL not set in .env.local — cannot dump database"
  exit 1
fi

# Prefer the brew-keg pg_dump that matches the Supabase server version.
# Falls back to whatever pg_dump is on PATH.
if [ -x "/opt/homebrew/opt/postgresql@17/bin/pg_dump" ]; then
  PG_BIN="/opt/homebrew/opt/postgresql@17/bin"
elif command -v pg_dump >/dev/null 2>&1; then
  PG_BIN="$(dirname "$(command -v pg_dump)")"
else
  err "pg_dump not found. Install with: brew install postgresql@17"
  exit 1
fi
export PATH="$PG_BIN:$PATH"
log "using pg_dump: $(pg_dump --version)"

# Export PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD from DATABASE_URL using
# Python, so special chars in the password don't get mangled by bash.
eval "$(python3 - <<'PY'
import os, urllib.parse as up, shlex
u = up.urlparse(os.environ["DATABASE_URL"])
vals = {
    "PGHOST": u.hostname or "",
    "PGPORT": str(u.port or 5432),
    "PGUSER": u.username or "",
    "PGDATABASE": (u.path or "/postgres").lstrip("/"),
    "PGPASSWORD": u.password or "",
    "PGSSLMODE": "require",
    "PGCONNECT_TIMEOUT": "15",
    # Supabase Supavisor pooler needs channel binding disabled for pg 17+
    "PGCHANNELBINDING": "disable",
}
for k, v in vals.items():
    print(f"export {k}={shlex.quote(v)}")
PY
)"

SCHEMA_OUT="$OUT_DIR/schema-$TIMESTAMP.sql"
DATA_OUT="$OUT_DIR/data-$TIMESTAMP.sql"

# Run a quick connectivity probe so we fail fast with a useful message.
log "probing database connection…"
if ! psql -Atqc "select 1" >/dev/null 2>"$OUT_DIR/.probe-err"; then
  ERR="$(cat "$OUT_DIR/.probe-err")"
  rm -f "$OUT_DIR/.probe-err"
  err "cannot connect to database:"
  echo "  $ERR" >&2
  echo "" >&2
  if echo "$ERR" | grep -qi "password authentication failed"; then
    err "DATABASE_URL password is invalid or stale."
    err "Fix: Supabase Dashboard → Project Settings → Database →"
    err "     reveal/reset password, update DATABASE_URL in .env.local AND Vercel."
  elif echo "$ERR" | grep -qi "Connection refused\|could not translate host"; then
    err "cannot reach Supabase host. Check network / project is not paused."
  fi
  exit 2
fi
rm -f "$OUT_DIR/.probe-err"
ok "connection verified"

# Dump schema
log "dumping schema…"
if ! pg_dump --schema-only --no-owner --no-privileges -f "$SCHEMA_OUT" 2>"$OUT_DIR/.dump-err"; then
  ERR="$(cat "$OUT_DIR/.dump-err")"
  rm -f "$OUT_DIR/.dump-err" "$SCHEMA_OUT"
  if echo "$ERR" | grep -qi "server version.*pg_dump version"; then
    SERVER_VER="$(echo "$ERR" | grep -oE "server version: [0-9]+" | head -1 | awk '{print $3}')"
    err "pg_dump version mismatch. Server is Postgres $SERVER_VER."
    err "Fix: brew install postgresql@${SERVER_VER} && brew link --force postgresql@${SERVER_VER}"
  else
    err "pg_dump failed:"
    echo "  $ERR" >&2
  fi
  exit 3
fi
rm -f "$OUT_DIR/.dump-err"
gzip -f "$SCHEMA_OUT"
ok "schema → $(basename "$SCHEMA_OUT").gz ($(du -h "$SCHEMA_OUT.gz" | cut -f1))"

# Dump data
log "dumping data (this can take a while on large tables)…"
if ! pg_dump --data-only --no-owner --no-privileges -f "$DATA_OUT" 2>"$OUT_DIR/.dump-err"; then
  ERR="$(cat "$OUT_DIR/.dump-err")"
  rm -f "$OUT_DIR/.dump-err" "$DATA_OUT"
  err "pg_dump data failed:"
  echo "  $ERR" >&2
  exit 4
fi
rm -f "$OUT_DIR/.dump-err"
gzip -f "$DATA_OUT"
ok "data → $(basename "$DATA_OUT").gz ($(du -h "$DATA_OUT.gz" | cut -f1))"

# Lock down the directory — db dumps contain production data.
chmod 600 "$OUT_DIR"/*.gz 2>/dev/null || true

prune_to_keep "$OUT_DIR" "schema-*.sql.gz" "$KEEP"
prune_to_keep "$OUT_DIR" "data-*.sql.gz" "$KEEP"

ok "db backup complete → $OUT_DIR"
