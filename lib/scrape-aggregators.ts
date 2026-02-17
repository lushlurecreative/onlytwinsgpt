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
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  Referer: "https://www.google.com/",
};

const DEFAULT_ONLYFINDER_URLS = [
  "https://onlyfinder.com/free",
  "https://onlyfinder.com/top",
];

const DEFAULT_FANFOX_URLS = [
  "https://fanfox.com/blogs/onlyfans/best-onlyfans-2025",
  "https://fanfox.com/blogs/onlyfans/free-onlyfans",
];

const DEFAULT_JUICYSEARCH_QUERIES = ["Curvy milf", "free onlyfans"];

function extractUsernameFromLinkText(text: string): string | null {
  const match = text.match(/onlyfans\.com\s*>\s*([^\s\]|]+)/i);
  return match ? match[1].trim() : null;
}

function extractUsernameFromHref(href: string): string | null {
  const match = href.match(/onlyfans\.com\/(@?[a-zA-Z0-9_.-]+)/i);
  return match ? match[1].replace(/^@/, "") : null;
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
    headers: BROWSER_HEADERS,
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

async function scrapeFanFoxPage(
  url: string
): Promise<{ leads: ScrapedLead[]; error?: string }> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    return { leads: [], error: `HTTP ${res.status}` };
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const leads: ScrapedLead[] = [];
  const seen = new Set<string>();

  $('a[href*="onlyfans.com"]').each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const username = extractUsernameFromHref(href);
    if (!username || seen.has(username.toLowerCase())) return;
    if (username.length < 3 || username.length > 50) return;
    seen.add(username.toLowerCase());

    const profileUrl = `https://onlyfans.com/${username}`;
    leads.push({
      handle: username,
      platform: "onlyfans",
      profileUrl,
      platformsFound: ["onlyfans"],
      profileUrls: { onlyfans: profileUrl },
      followerCount: 0,
      engagementRate: 0,
      luxuryTagHits: 0,
    });
  });

  return { leads };
}

export async function scrapeFanFox(
  urls: string[] = DEFAULT_FANFOX_URLS,
  opts?: { withDiagnostics?: boolean }
): Promise<ScrapedLead[] | { leads: ScrapedLead[]; diagnostics: AggregatorDiagnostic[] }> {
  const allLeads: ScrapedLead[] = [];
  const seen = new Set<string>();
  const diagnostics: AggregatorDiagnostic[] = [];

  for (const url of urls.slice(0, 5)) {
    try {
      const { leads, error } = await scrapeFanFoxPage(url);
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

function parseSetCookies(res: Response): string[] {
  const cookies: string[] = [];
  res.headers.getSetCookie?.()?.forEach((c) => {
    const part = c.split(";")[0];
    if (part) cookies.push(part);
  });
  const legacy = res.headers.get("set-cookie");
  if (legacy && !res.headers.getSetCookie) {
    legacy.split(/,(?=\s*\w+=)/).forEach((c) => {
      const part = c.split(";")[0].trim();
      if (part) cookies.push(part);
    });
  }
  return cookies;
}

async function scrapeJuicySearchPage(
  query: string,
  cookieJar?: string[]
): Promise<{ leads: ScrapedLead[]; error?: string; cookies?: string[] }> {
  const baseUrl = "https://juicysearch.com";
  const searchUrl = `${baseUrl}/results/?q=${encodeURIComponent(query)}`;

  const headers: Record<string, string> = { ...BROWSER_HEADERS };

  let cookies = cookieJar ?? [];

  if (cookies.length === 0) {
    const homeRes = await fetch(baseUrl + "/", {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    cookies = parseSetCookies(homeRes);
  }

  const ageCookies = ["age_gate=1", "isAgeVerified=1", "adult=1"];
  headers["Cookie"] = [...cookies, ...ageCookies].join("; ");

  const verifyPaths = ["/enter", "/verify", "/age-verify"];
  for (const path of verifyPaths) {
    try {
      const verifyRes = await fetch(baseUrl + path, {
        headers,
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });
      const newCookies = parseSetCookies(verifyRes);
      if (newCookies.length > 0) {
        cookies = [...cookies, ...newCookies];
        headers["Cookie"] = [...cookies, ...ageCookies].join("; ");
        break;
      }
    } catch {
      break;
    }
  }

  const res = await fetch(searchUrl, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    return { leads: [], error: `HTTP ${res.status}`, cookies: [...cookies, ...ageCookies] };
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const leads: ScrapedLead[] = [];
  const seen = new Set<string>();

  $('a[href*="onlyfans.com"]').each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const username = extractUsernameFromHref(href);
    if (!username || seen.has(username.toLowerCase())) return;
    if (username.length < 3 || username.length > 50) return;
    seen.add(username.toLowerCase());

    const profileUrl = `https://onlyfans.com/${username}`;
    leads.push({
      handle: username,
      platform: "onlyfans",
      profileUrl,
      platformsFound: ["onlyfans"],
      profileUrls: { onlyfans: profileUrl },
      followerCount: 0,
      engagementRate: 0,
      luxuryTagHits: 0,
    });
  });

  return { leads, cookies: [...cookies, ...ageCookies] };
}

export async function scrapeJuicySearch(
  queries: string[] = DEFAULT_JUICYSEARCH_QUERIES,
  opts?: { withDiagnostics?: boolean }
): Promise<ScrapedLead[] | { leads: ScrapedLead[]; diagnostics: AggregatorDiagnostic[] }> {
  const allLeads: ScrapedLead[] = [];
  const seen = new Set<string>();
  const diagnostics: AggregatorDiagnostic[] = [];
  let cookieJar: string[] | undefined;

  for (const q of queries.slice(0, 3)) {
    const url = `https://juicysearch.com/results/?q=${encodeURIComponent(q)}`;
    try {
      const { leads, error, cookies } = await scrapeJuicySearchPage(q, cookieJar);
      if (cookies && cookies.length > 0) cookieJar = cookies;
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
