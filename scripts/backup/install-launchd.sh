#!/usr/bin/env bash
# install-launchd.sh — Schedule a daily OnlyTwins backup via launchd.
#
# Installs ~/Library/LaunchAgents/com.onlytwins.backup.plist that runs
# backup-all.sh every day at 03:15 local time. Output is logged to
# $BACKUP_ROOT/launchd.log.
#
# Uninstall with:  launchctl unload ~/Library/LaunchAgents/com.onlytwins.backup.plist
#                  rm ~/Library/LaunchAgents/com.onlytwins.backup.plist

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "$HERE/_lib.sh"

PLIST="$HOME/Library/LaunchAgents/com.onlytwins.backup.plist"
SCRIPT="$HERE/backup-all.sh"
LOG="$BACKUP_ROOT/launchd.log"

ensure_dir "$BACKUP_ROOT"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.onlytwins.backup</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$REPO_ROOT</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>BACKUP_ROOT</key>
    <string>$BACKUP_ROOT</string>
  </dict>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>15</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrorPath</key>
  <string>$LOG</string>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

ok "installed launchd agent: $PLIST"
ok "next run: daily at 03:15 local time"
ok "log: $LOG"
echo ""
echo "To run immediately:   launchctl start com.onlytwins.backup"
echo "To uninstall:         launchctl unload $PLIST && rm $PLIST"
