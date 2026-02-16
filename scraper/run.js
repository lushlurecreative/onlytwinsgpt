#!/usr/bin/env node
/**
 * OnlyTwins Lead Scraper
 * Load .env if present
 */
try {
  const fs = await import("fs");
  const path = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
} catch (_) {}

/**
 * Polls GET /api/admin/leads/pending-scrape. When a trigger exists, runs scrape
 * and POSTs results to /api/admin/leads/ingest.
 *
 * Run: npm start (or node run.js)
 * Requires: BASE_URL, WEBHOOK_SECRET in env or .env
 */

const POLL_INTERVAL_MS = 60_000;

function getEnv(name) {
  const val = process.env[name];
  if (!val?.trim()) throw new Error(`Missing env: ${name}`);
  return val.trim();
}

async function pollPending(baseUrl, secret) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/admin/leads/pending-scrape`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    throw new Error(`pending-scrape failed: ${res.status}`);
  }
  return res.json();
}

async function ingestLeads(baseUrl, secret, leads) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/admin/leads/ingest`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ leads }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ingest failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Reddit JSON API (no auth). Fetches recent posts from subreddits and extracts authors.
 */
async function scrapeReddit(criteria) {
  const subreddits = [
    "ContentCreator",
    "OnlyFansCreators",
    "Creators",
    "CreatorsAdvice",
    "Instagram",
    "influencermarketing",
  ];
  const leads = [];
  const seen = new Set();

  for (const sub of subreddits) {
    try {
      const url = `https://www.reddit.com/r/${sub}/new.json?limit=25`;
      const res = await fetch(url, {
        headers: { "User-Agent": "OnlyTwinsScraper/1.0" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const posts = data?.data?.children ?? [];
      for (const p of posts) {
        const author = p?.data?.author;
        if (!author || author === "[deleted]" || seen.has(author.toLowerCase())) continue;
        seen.add(author.toLowerCase());

        const followerMin = criteria?.followerRange?.reddit?.min ?? 0;
        const karma = p?.data?.author_flair_text ? 0 : (p?.data?.score ?? 0);
        const ups = p?.data?.ups ?? 0;
        if (followerMin > 0 && ups < followerMin / 1000) continue;

        leads.push({
          handle: author,
          platform: "reddit",
          profileUrl: `https://reddit.com/user/${author}`,
          platformsFound: ["reddit"],
          profileUrls: { reddit: `https://reddit.com/user/${author}` },
          followerCount: Math.max(ups, karma, 0),
          engagementRate: 1,
          luxuryTagHits: 0,
        });
      }
    } catch (err) {
      console.error(`Reddit r/${sub}:`, err.message);
    }
  }

  return leads.slice(0, 20);
}

async function runOnce(baseUrl, secret) {
  const data = await pollPending(baseUrl, secret);
  if (!data.hasPending) return false;

  const criteria = data.criteria ?? {};
  console.log("Trigger received. Criteria:", JSON.stringify(criteria, null, 2));

  const leads = await scrapeReddit(criteria);
  if (leads.length === 0) {
    console.log("No leads found this run.");
    return true;
  }

  const result = await ingestLeads(baseUrl, secret, leads);
  console.log(`Ingested ${result.imported ?? 0} leads.`);
  return true;
}

async function main() {
  let baseUrl, secret;
  try {
    baseUrl = getEnv("BASE_URL");
    secret = getEnv("WEBHOOK_SECRET");
  } catch (e) {
    console.error(e.message);
    console.error("\nCreate scraper/.env with:");
    console.error("  BASE_URL=https://onlytwins.dev");
    console.error("  WEBHOOK_SECRET=<your ANTIGRAVITY_WEBHOOK_SECRET>");
    process.exit(1);
  }

  console.log("OnlyTwins Scraper running. Polling every", POLL_INTERVAL_MS / 1000, "s.");
  console.log("BASE_URL:", baseUrl);

  const poll = async () => {
    try {
      await runOnce(baseUrl, secret);
    } catch (err) {
      console.error("Poll error:", err.message);
    }
    setTimeout(poll, POLL_INTERVAL_MS);
  };

  poll();
}

main();
