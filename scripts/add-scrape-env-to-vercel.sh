#!/bin/bash
# Add scraping-related env vars from .env.local to Vercel.
# Run from project root: ./scripts/add-scrape-env-to-vercel.sh
# Prereqs: Add YOUTUBE_API_KEY, REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET to .env.local (optional: SCRAPER_API_KEY)
#   Create at: Google Cloud Console, reddit.com/prefs/apps. Aggregators use free AllOrigins fallback when blocked.

set -e
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "No .env.local found. Create it with YOUTUBE_API_KEY, REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET"
  exit 1
fi

source .env.local 2>/dev/null || true

add_or_update() {
  local name="$1"
  local val="${!name}"
  if [ -z "$val" ]; then
    echo "Skipping $name (not set in .env.local)"
    return
  fi
  if echo -n "$val" | npx vercel env add "$name" production --yes 2>/dev/null; then
    echo "Added $name"
  else
    echo -n "$val" | npx vercel env update "$name" production --yes && echo "Updated $name"
  fi
}

add_or_update YOUTUBE_API_KEY
add_or_update REDDIT_CLIENT_ID
add_or_update REDDIT_CLIENT_SECRET
add_or_update SCRAPER_API_KEY

echo "Done. Redeploy for changes: git commit --allow-empty -m 'trigger redeploy' && git push"
