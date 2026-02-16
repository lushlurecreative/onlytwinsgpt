# OnlyTwins Lead Scraper

Polls the OnlyTwins API for scrape triggers. When you click "Run scrape" on the admin leads page, this scraper picks up the trigger and runs discovery, then POSTs results to the ingest endpoint.

## Setup

1. Copy `.env.example` to `.env`
2. Set `BASE_URL` (e.g. `https://onlytwins.dev`)
3. Set `WEBHOOK_SECRET` to the same value as `ANTIGRAVITY_WEBHOOK_SECRET` in Vercel

## Run

```bash
cd scraper
npm start
```

Or: `node run.js`

Leave it running. It polls every 60 seconds. When you click "Run scrape" on the website, the next poll will detect it and run the scrape.

## Current behavior

- **Reddit**: Fetches recent posts from creator-related subreddits, extracts usernames as leads.
- **Other platforms** (Instagram, Twitter, etc.): Not yet implemented. Add scrapers in `run.js` and merge results before calling `ingestLeads`.

## Extending

Edit `scrapeReddit` and add new scraper functions (e.g. `scrapeTwitter`, `scrapeInstagram`). Call them when `data.hasPending` and merge leads. Use `criteria` to filter by follower range, platforms, activity mode, etc.
