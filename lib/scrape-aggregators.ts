/**
 * Scrapes OnlyFans creator profiles from aggregator sites (OnlyFinder, FanFox, JuicySearch).
 * Uses fetch + cheerio for HTML parsing. Per executive decision: crawl and scrape.
 */

import * as cheerio from "cheerio";
import type { ScrapedLead } from "./scrape-reddit";

export type AggregatorDiagnostic = {
  url: string;
  ok: boolean;
  leadCount?: number;
  error?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_ONLYFINDER_URLS = [
  "https://onlyfinder.com/free",
  "https://onlyfinder.com/top",
];

function extractUsernameFromLinkText(text: string): string | null {
  const match = text.match(/onlyfans\.com\s*>\s*([^\s\]|]+)/i);
  return match ? match[1].trim() : null;
}

function extractUsernameFromEncodedUrl(href: string): string | null {
  try {
    const match = href.match(/[?&]e=([^&]+)/);
    if (!match) return null;
    const decoded = Buffer.from(match[1], "base64").toString("utf-8");
    const uMatch = decoded.match(/[?&]u=([^&]+)/);
    return uMatch ? decodeURIComponent(uMatch[1]) : null;
  } catch {
    return null;
  }
}

function parseFollowerCount(numStr: string): number {
  const cleaned = numStr.replace(/[,\s]/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? 0 : n;
}

async function scrapeOnlyFinderPage(
  url: string
): Promise<{ leads: ScrapedLead[]; error?: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    return { leads: [], error: `HTTP ${res.status}` };
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const leads: ScrapedLead[] = [];
  const seen = new Set<string>();

  $('a[href*="visit-profile"]').each((_i, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    const text = $el.text().trim();

    let username =
      extractUsernameFromLinkText(text) ?? extractUsernameFromEncodedUrl(href);
    if (!username || seen.has(username.toLowerCase())) return;
    seen.add(username.toLowerCase());

    const profileUrl = `https://onlyfans.com/${username}`;
    let followerCount = 0;

    const $parent = $el.closest("div, article, section, li");
    if ($parent.length) {
      const parentText = $parent.text();
      const numMatches = parentText.match(/\d{1,3}(?:,\d{3})+/g);
      if (numMatches && numMatches.length > 0) {
        const first = parseFollowerCount(numMatches[0]);
        if (first > 100) followerCount = first;
      }
    }

    leads.push({
      handle: username,
      platform: "onlyfans",
      profileUrl,
      platformsFound: ["onlyfans"],
      profileUrls: { onlyfans: profileUrl },
      followerCount,
      engagementRate: 0,
      luxuryTagHits: 0,
    });
  });

  return { leads };
}

export async function scrapeOnlyFinder(
  urls: string[] = DEFAULT_ONLYFINDER_URLS,
  opts?: { withDiagnostics?: boolean }
): Promise<ScrapedLead[] | { leads: ScrapedLead[]; diagnostics: AggregatorDiagnostic[] }> {
  const allLeads: ScrapedLead[] = [];
  const seen = new Set<string>();
  const diagnostics: AggregatorDiagnostic[] = [];

  for (const url of urls.slice(0, 3)) {
    try {
      const { leads, error } = await scrapeOnlyFinderPage(url);
      if (error) {
        diagnostics.push({ url, ok: false, error });
        continue;
      }
      diagnostics.push({ url, ok: true, leadCount: leads.length });

      for (const l of leads) {
        const key = `${l.platform}:${l.handle.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          allLeads.push(l);
        }
      }

      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      diagnostics.push({
        url,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result = allLeads.slice(0, 30);
  if (opts?.withDiagnostics) {
    return { leads: result, diagnostics };
  }
  return result;
}

export async function scrapeFanFox(
  _urls?: string[],
  opts?: { withDiagnostics?: boolean }
): Promise<ScrapedLead[] | { leads: ScrapedLead[]; diagnostics: AggregatorDiagnostic[] }> {
  return opts?.withDiagnostics ? { leads: [], diagnostics: [] } : [];
}

export async function scrapeJuicySearch(
  _queries?: string[],
  opts?: { withDiagnostics?: boolean }
): Promise<ScrapedLead[] | { leads: ScrapedLead[]; diagnostics: AggregatorDiagnostic[] }> {
  return opts?.withDiagnostics ? { leads: [], diagnostics: [] } : [];
}
