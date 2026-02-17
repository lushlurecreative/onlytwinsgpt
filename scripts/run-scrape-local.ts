#!/usr/bin/env npx tsx
/**
 * Run scrapers locally (from your machine) and POST leads to the ingest endpoint.
 * Loads .env.local if present (for YOUTUBE_API_KEY, REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET).
 * Uses your IP instead of Vercel's — can help when Reddit/aggregators block cloud IPs.
 *
 * Usage:
 *   BASE_URL=https://your-app.vercel.app WEBHOOK_SECRET=<ANTIGRAVITY_WEBHOOK_SECRET> npm run scrape:local
 *
 * Env:
 *   BASE_URL - Your deployed app URL (e.g. https://onlytwins.dev)
 *   WEBHOOK_SECRET - Same as ANTIGRAVITY_WEBHOOK_SECRET in Vercel
 */
import * as fs from "fs";
import * as path from "path";
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

import { scrapeReddit } from "../lib/scrape-reddit";
import { scrapeYouTube } from "../lib/scrape-youtube";
import { scrapeOnlyFinder, scrapeFanFox, scrapeJuicySearch } from "../lib/scrape-aggregators";
import type { ScrapedLead } from "../lib/scrape-reddit";

function getEnv(name: string): string {
  const val = process.env[name]?.trim();
  if (!val) throw new Error(`Missing env: ${name}`);
  return val;
}

function toIngestLead(l: ScrapedLead) {
  return {
    handle: l.handle,
    platform: l.platform,
    profileUrl: l.profileUrl,
    profileUrls: l.profileUrls,
    platformsFound: l.platformsFound,
    followerCount: l.followerCount,
    engagementRate: l.engagementRate,
    luxuryTagHits: l.luxuryTagHits,
    sampleUrls: l.sampleUrls,
  };
}

async function ingestLeads(baseUrl: string, secret: string, leads: ScrapedLead[]) {
  if (leads.length === 0) return { imported: 0 };
  const url = `${baseUrl.replace(/\/$/, "")}/api/admin/leads/ingest`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ leads: leads.map(toIngestLead) }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ingest failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ imported: number }>;
}

async function main() {
  const baseUrl = getEnv("BASE_URL");
  const secret = getEnv("WEBHOOK_SECRET");

  console.log("Running scrapers locally (your IP)...");

  const [ytResult, redditResult, onlyfinderResult, fanfoxResult, juicyResult] = await Promise.all([
    scrapeYouTube({}, { withDiagnostics: true }),
    scrapeReddit(undefined, { withDiagnostics: true }),
    scrapeOnlyFinder(undefined, { withDiagnostics: true }),
    scrapeFanFox(undefined, { withDiagnostics: true }),
    scrapeJuicySearch(undefined, { withDiagnostics: true }),
  ]);

  const ytLeads = Array.isArray(ytResult) ? ytResult : ytResult.leads;
  const redditLeads = redditResult.leads;
  const onlyfinderLeads = Array.isArray(onlyfinderResult) ? onlyfinderResult : onlyfinderResult.leads;
  const fanfoxLeads = Array.isArray(fanfoxResult) ? fanfoxResult : fanfoxResult.leads;
  const juicyLeads = Array.isArray(juicyResult) ? juicyResult : juicyResult.leads;

  const seen = new Set<string>();
  const allLeads: ScrapedLead[] = [];
  for (const l of [...ytLeads, ...redditLeads, ...onlyfinderLeads, ...fanfoxLeads, ...juicyLeads]) {
    const key = `${l.platform}:${l.handle.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      allLeads.push(l);
    }
  }

  console.log(
    `Collected: YouTube ${ytLeads.length}, Reddit ${redditLeads.length}, OnlyFinder ${onlyfinderLeads.length}, FanFox ${fanfoxLeads.length}, JuicySearch ${juicyLeads.length} -> ${allLeads.length} unique`
  );

  if (allLeads.length === 0) {
    console.log("No leads to ingest. Add YOUTUBE_API_KEY, REDDIT_CLIENT_ID/SECRET locally or in Vercel.");
    process.exit(0);
  }

  const { imported } = await ingestLeads(baseUrl, secret, allLeads);
  console.log(`Imported ${imported} leads.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
