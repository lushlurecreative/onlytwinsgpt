#!/usr/bin/env bash
# end-session.sh — Run at the end of any work session.
# Surfaces the information needed to fill docs/handoff-template.md.
# Nothing is committed automatically.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HANDOFF_TEMPLATE="$REPO_ROOT/docs/handoff-template.md"
PRIMER="$REPO_ROOT/primer.md"
HANDOFF_OUT="$REPO_ROOT/docs/handoff-$(date +%Y-%m-%d).md"

# ── Colours ────────────────────────────────────────────────────────────────
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
YELLOW='\033[33m'
GREEN='\033[32m'
RESET='\033[0m'

divider() { echo -e "${DIM}────────────────────────────────────────────────────────${RESET}"; }

echo ""
echo -e "${BOLD}${CYAN}END-OF-SESSION REPORT${RESET}  $(date '+%Y-%m-%d %H:%M')"
divider

# ── 1. primer.md status ────────────────────────────────────────────────────
echo -e "${BOLD}primer.md changes since last commit${RESET}"
if git diff HEAD -- primer.md | grep -q '^[+-]'; then
  git diff HEAD -- primer.md | grep '^[+-]' | grep -v '^---\|^+++' | head -30
else
  echo -e "${YELLOW}  No changes. Did you forget to update it?${RESET}"
fi
divider

# ── 2. Files changed this session ─────────────────────────────────────────
echo -e "${BOLD}Files changed (staged + unstaged)${RESET}"
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null)
if [ -z "$CHANGED_FILES" ]; then
  echo -e "${DIM}  (none — everything is committed)${RESET}"
else
  echo "$CHANGED_FILES" | sed 's/^/  /'
fi
divider

# ── 3. Last 5 commits ─────────────────────────────────────────────────────
echo -e "${BOLD}Last 5 commits${RESET}"
git log --oneline -5 | sed 's/^/  /'
divider

# ── 4. Migrations not yet marked as applied ───────────────────────────────
echo -e "${BOLD}Recent migrations (last 5 by filename)${RESET}"
ls "$REPO_ROOT/supabase/migrations/"*.sql 2>/dev/null | sort | tail -5 | xargs -I{} basename {} | sed 's/^/  /'
divider

# ── 5. Unstaged / untracked files ─────────────────────────────────────────
echo -e "${BOLD}Git status${RESET}"
git -C "$REPO_ROOT" status --short | sed 's/^/  /'
divider

# ── 6. Generate pre-filled handoff ────────────────────────────────────────
DATE=$(date +%Y-%m-%d)
LAST_COMMITS=$(git log --oneline -5 | sed 's/^/  /')
FILES_FOR_TABLE=$(git diff --name-only HEAD 2>/dev/null | while IFS= read -r f; do
  echo "| \`$f\` | edited | |"
done)
if [ -z "$FILES_FOR_TABLE" ]; then
  FILES_FOR_TABLE="| _(all changes committed — see git log above)_ | | |"
fi

TMPFILE=$(mktemp)
awk -v date="$DATE" '
  /^_Last session:/ { print "_Last session: " date "_"; next }
  { print }
' "$HANDOFF_TEMPLATE" > "$TMPFILE" && cp "$TMPFILE" "$HANDOFF_OUT"
rm -f "$TMPFILE"

echo -e "${BOLD}${GREEN}Handoff file created:${RESET} docs/handoff-$DATE.md"
echo ""
echo -e "  ${DIM}Fill it in, then paste as the opening message next session.${RESET}"
echo -e "  ${DIM}Open it with: open \"$HANDOFF_OUT\"${RESET}"
divider

# ── 7. Checklist reminder ──────────────────────────────────────────────────
echo -e "${BOLD}Before you close${RESET}"
echo "  [ ] primer.md updated"
echo "  [ ] tasks/lessons.md updated (if a new mistake was hit)"
echo "  [ ] docs/current-known-issues.md updated"
echo "  [ ] handoff-$DATE.md filled in"
echo "  [ ] memory files committed with the code changes"
echo ""
