/**
 * Scrapes OnlyFans creator profiles from aggregator sites (OnlyFinder, FanFox, JuicySearch).
 * Uses fetch + cheerio for HTML parsing. Per executive decision: crawl and scrape.
 */

import * as cheerio from "cheerio";
import type { ScrapedLead } from "./scrape-reddit";
import { filterCreatorImages } from "./validate-lead";

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

const ONLYFINDER_BASES = [
  "https://onlyfinder.com/free",
  "https://onlyfinder.com/top",
  "https://onlyfinder.com/new",
  "https://onlyfinder.com/popular",
];

function onlyFinderUrls(): string[] {
  const urls: string[] = [];
  for (const base of ONLYFINDER_BASES) {
    urls.push(base);
    for (let p = 2; p <= 10; p++) urls.push(`${base}?page=${p}`);
  }
  return urls;
}

const FANFOX_BASES = [
  "https://fanfox.com/blogs/onlyfans/best-onlyfans-2025",
  "https://fanfox.com/blogs/onlyfans/free-onlyfans",
  "https://fanfox.com/blogs/onlyfans/amateur-onlyfans",
  "https://fanfox.com/blogs/onlyfans/petite-onlyfans",
  "https://fanfox.com/blogs/onlyfans/blonde-onlyfans",
  "https://fanfox.com/blogs/onlyfans/latina-onlyfans",
  "https://fanfox.com/blogs/onlyfans/redhead-onlyfans",
  "https://fanfox.com/blogs/onlyfans/british-onlyfans",
  "https://fanfox.com/blogs/onlyfans/trans-onlyfans",
  "https://fanfox.com/blogs/onlyfans/best-onlyfans",
];

function fanFoxUrls(): string[] {
  const urls: string[] = [];
  for (const base of FANFOX_BASES) {
    urls.push(base);
    for (let p = 2; p <= 5; p++) urls.push(`${base}?page=${p}`);
  }
  return urls;
}

const DEFAULT_JUICYSEARCH_QUERIES = [
  "Curvy milf",
  "free onlyfans",
  "best onlyfans",
  "amateur onlyfans",
  "petite onlyfans",
  "blonde onlyfans",
  "latina onlyfans",
  "redhead onlyfans",
];

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
  const cleaned = numStr.replace(/[,\s]/g, "").toLowerCase();
  if (cleaned.endsWith("m")) return Math.floor(parseFloat(cleaned) * 1_000_000) || 0;
  if (cleaned.endsWith("k")) return Math.floor(parseFloat(cleaned) * 1_000) || 0;
  const n = parseInt(numStr.replace(/[,\s]/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseFollowerFromText(text: string): number {
  const m1 = text.match(/(\d+(?:[.,]\d+)?)\s*(?:M|m|million)/);
  if (m1) return Math.floor(parseFloat(m1[1].replace(",", "")) * 1_000_000) || 0;
  const m2 = text.match(/(\d+(?:[.,]\d+)?)\s*(?:K|k|thousand)/);
  if (m2) return Math.floor(parseFloat(m2[1].replace(",", "")) * 1_000) || 0;
  const m3 = text.match(/(\d+(?:[.,]\d+)?)\s*(?:M|m)(?!\w)/);
  if (m3) return Math.floor(parseFloat(m3[1].replace(",", "")) * 1_000_000) || 0;
  const m4 = text.match(/(\d+(?:[.,]\d+)?)\s*(?:K|k)(?!\w)/);
  if (m4) return Math.floor(parseFloat(m4[1].replace(",", "")) * 1_000) || 0;
  const m5 = text.match(/(\d{1,3}(?:,\d{3})*)\s*(?:followers?|subs?|fans?|likes?)/i);
  if (m5) return parseFollowerCount(m5[1]) || 0;
  const m6 = text.match(/\b(\d{1,3}(?:,\d{3})+)\b/);
  if (m6) return parseFollowerCount(m6[1]) || 0;
  const m7 = text.match(/\b(\d{4,})\b/);
  if (m7) return parseFollowerCount(m7[1]) || 0;
  return 0;
}

function resolveUrl(base: string, href: string): string {
  if (!href || !href.startsWith("/") && !href.startsWith("./")) return href;
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function extractInstagramUrl($: cheerio.CheerioAPI, $container: ReturnType<cheerio.CheerioAPI>, baseUrl: string): string | null {
  const ig = $container.find('a[href*="instagram.com"]').first();
  const href = ig.attr("href");
  if (!href) return null;
  const abs = resolveUrl(baseUrl, href);
  if (/instagram\.com\//i.test(abs)) return abs;
  return null;
}

function getImgUrl($: cheerio.CheerioAPI, img: unknown, baseUrl: string): string | null {
  const $img = $(img as Parameters<cheerio.CheerioAPI>[0]);
  const src =
    $img.attr("src") ??
    $img.attr("data-src") ??
    $img.attr("data-lazy-src") ??
    (() => {
      const srcset = $img.attr("data-srcset") ?? $img.attr("srcset");
      if (srcset) {
        const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
        return first ?? null;
      }
      return null;
    })();
  if (!src || /logo|icon|avatar-placeholder|pixel|1x1|spacer|badge/i.test(src)) return null;
  if (!/\.(webp|gif|jpg|jpeg|png)/i.test(src) && !/cdn|cloudfront|img|image|gravatar|assets/i.test(src)) return null;
  const abs = resolveUrl(baseUrl, src);
  return abs.startsWith("http") ? abs : null;
}

function extractImageUrls($: cheerio.CheerioAPI, $link: ReturnType<cheerio.CheerioAPI>, $container: ReturnType<cheerio.CheerioAPI>, baseUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const add = (src: string | null) => {
    if (src && !seen.has(src)) {
      seen.add(src);
      urls.push(src);
    }
  };
  $link.find("img").each((_, img) => add(getImgUrl($, img, baseUrl)));
  $container.find("img").each((_, img) => add(getImgUrl($, img, baseUrl)));
  return urls.slice(0, 5);
}

const ALLORIGINS_BASE = "https://api.allorigins.win/raw?url=";
const ALLORIGINS_RATE_MS = 5000;

let lastAllOriginsCall = 0;

async function fetchViaAllOrigins(url: string): Promise<Response> {
  const now = Date.now();
  const wait = ALLORIGINS_RATE_MS - (now - lastAllOriginsCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAllOriginsCall = Date.now();

  const res = await fetch(ALLORIGINS_BASE + encodeURIComponent(url), {
    signal: AbortSignal.timeout(25000),
  });
  const html = await res.text();
  return new Response(html, { status: res.ok ? 200 : res.status });
}

async function fetchViaApify(url: string): Promise<Response> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) throw new Error("APIFY_TOKEN not set");
  const { ApifyClient } = await import("apify-client");
  const client = new ApifyClient({ token });
  const run = await client.actor("dataguru/html-extractor").call(
    { url, timeoutSec: 30 },
    { waitSecs: 90 }
  );
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const item = items?.[0] as { html?: string; statusCode?: number } | undefined;
  const html = item?.html ?? "";
  const status = item?.statusCode ?? (html ? 200 : 502);
  return new Response(html, { status });
}

async function fetchPage(url: string): Promise<Response> {
  const apifyToken = process.env.APIFY_TOKEN?.trim();
  if (apifyToken) {
    try {
      return await fetchViaApify(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(`Apify error: ${msg}`, { status: 502 });
    }
  }

  const key = process.env.SCRAPER_API_KEY?.trim();
  if (key) {
    const proxyUrl = `https://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(url)}`;
    return fetch(proxyUrl, { signal: AbortSignal.timeout(20000) });
  }

  const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) });
  if (res.ok) return res;

  if (res.status === 403 || res.status === 503) {
    try {
      return await fetchViaAllOrigins(url);
    } catch {
      return res;
    }
  }
  return res;
}

async function scrapeOnlyFinderPage(
  url: string
): Promise<{ leads: ScrapedLead[]; error?: string }> {
  const res = await fetchPage(url);
  if (!res.ok) {
    return { leads: [], error: `HTTP ${res.status}` };
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const leads: ScrapedLead[] = [];
  const seen = new Set<string>();
  const baseUrl = url.replace(/\/[^/]*$/, "/");

  $('a[href*="visit-profile"]').each((_i, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    const text = $el.text().trim();

    let username =
      extractUsernameFromLinkText(text) ?? extractUsernameFromEncodedUrl(href);
    if (!username || seen.has(username.toLowerCase())) return;
    seen.add(username.toLowerCase());

    const profileUrl = `https://onlyfans.com/${username}`;
    const $parent = $el.closest("div, article, section, li, [class*='card'], [class*='item'], [class*='creator']");
    const parentText = $parent.length ? $parent.text() : "";
    let followerCount = parseFollowerFromText(parentText);
    if (followerCount === 0) {
      const m = parentText.match(/\d{1,3}(?:,\d{3})+/g);
      if (m?.length) followerCount = parseFollowerCount(m[0]);
    }

    const rawUrls = $parent.length ? extractImageUrls($, $el, $parent.first(), baseUrl) : [];
    const sampleUrls = filterCreatorImages(rawUrls);
    const instagramUrl = $parent.length ? extractInstagramUrl($, $parent.first(), baseUrl) : null;
    const profileUrls: Record<string, string> = { onlyfans: profileUrl };
    const platformsFound = ["onlyfans"];
    if (instagramUrl) {
      profileUrls.instagram = instagramUrl;
      platformsFound.push("instagram");
    }

    leads.push({
      handle: username,
      platform: "onlyfans",
      profileUrl,
      platformsFound,
      profileUrls,
      followerCount,
      engagementRate: followerCount > 0 ? 1 : 0,
      luxuryTagHits: 0,
      sampleUrls: sampleUrls.length ? sampleUrls : undefined,
    });
  });

  return { leads };
}

export async function scrapeOnlyFinder(
  urls: string[] = onlyFinderUrls(),
  opts?: { withDiagnostics?: boolean }
): Promise<ScrapedLead[] | { leads: ScrapedLead[]; diagnostics: AggregatorDiagnostic[] }> {
  const allLeads: ScrapedLead[] = [];
  const seen = new Set<string>();
  const diagnostics: AggregatorDiagnostic[] = [];

  for (const url of urls.slice(0, 30)) {
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

  const result = allLeads.slice(0, 3000);
  if (opts?.withDiagnostics) {
    return { leads: result, diagnostics };
  }
  return result;
}

async function scrapeFanFoxPage(
  url: string
): Promise<{ leads: ScrapedLead[]; error?: string }> {
  const res = await fetchPage(url);
  if (!res.ok) {
    return { leads: [], error: `HTTP ${res.status}` };
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const leads: ScrapedLead[] = [];
  const seen = new Set<string>();
  const baseUrl = "https://fanfox.com";

  $('a[href*="onlyfans.com"]').each((_i, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    const username = extractUsernameFromHref(href);
    if (!username || seen.has(username.toLowerCase())) return;
    if (username.length < 3 || username.length > 50) return;
    seen.add(username.toLowerCase());

    const profileUrl = `https://onlyfans.com/${username}`;
    const $parent = $el.closest("div, article, section, li, [class*='card'], [class*='item'], [class*='creator'], figure");
    const parentText = $parent.length ? $parent.text() : "";
    const followerCount = parseFollowerFromText(parentText);
    const rawUrls = $parent.length ? extractImageUrls($, $el, $parent.first(), baseUrl) : [];
    const sampleUrls = filterCreatorImages(rawUrls);
    const instagramUrl = $parent.length ? extractInstagramUrl($, $parent.first(), baseUrl) : null;
    const profileUrls: Record<string, string> = { onlyfans: profileUrl };
    const platformsFound = ["onlyfans"];
    if (instagramUrl) {
      profileUrls.instagram = instagramUrl;
      platformsFound.push("instagram");
    }

    leads.push({
      handle: username,
      platform: "onlyfans",
      profileUrl,
      platformsFound,
      profileUrls,
      followerCount,
      engagementRate: followerCount > 0 ? 1 : 0,
      luxuryTagHits: 0,
      sampleUrls: sampleUrls.length ? sampleUrls : undefined,
    });
  });

  return { leads };
}

export async function scrapeFanFox(
  urls: string[] = fanFoxUrls(),
  opts?: { withDiagnostics?: boolean }
): Promise<ScrapedLead[] | { leads: ScrapedLead[]; diagnostics: AggregatorDiagnostic[] }> {
  const allLeads: ScrapedLead[] = [];
  const seen = new Set<string>();
  const diagnostics: AggregatorDiagnostic[] = [];

  for (const url of urls.slice(0, 50)) {
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

  const result = allLeads.slice(0, 3000);
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

  let cookies = cookieJar ?? [];

  if (cookies.length === 0) {
    const homeRes = await fetchPage(baseUrl + "/");
    cookies = parseSetCookies(homeRes);
  }

  const ageCookies = ["age_gate=1", "isAgeVerified=1", "adult=1"];
  cookies = [...cookies, ...ageCookies];

  const verifyPaths = ["/enter", "/verify", "/age-verify"];
  for (const path of verifyPaths) {
    try {
      const verifyRes = await fetchPage(baseUrl + path);
      const newCookies = parseSetCookies(verifyRes);
      if (newCookies.length > 0) {
        cookies = [...cookies, ...newCookies];
        break;
      }
    } catch {
      break;
    }
  }

  const res = await fetchPage(searchUrl);
  if (!res.ok) {
    return { leads: [], error: `HTTP ${res.status}`, cookies };
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const leads: ScrapedLead[] = [];
  const seen = new Set<string>();

  $('a[href*="onlyfans.com"]').each((_i, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    const username = extractUsernameFromHref(href);
    if (!username || seen.has(username.toLowerCase())) return;
    if (username.length < 3 || username.length > 50) return;
    seen.add(username.toLowerCase());

    const profileUrl = `https://onlyfans.com/${username}`;
    const $parent = $el.closest("div, article, section, li, [class*='card'], [class*='item'], [class*='creator']");
    const parentText = $parent.length ? $parent.text() : "";
    const followerCount = parseFollowerFromText(parentText);
    const rawUrls = $parent.length ? extractImageUrls($, $el, $parent.first(), baseUrl + "/") : [];
    const sampleUrls = filterCreatorImages(rawUrls);
    const instagramUrl = $parent.length ? extractInstagramUrl($, $parent.first(), baseUrl + "/") : null;
    const profileUrls: Record<string, string> = { onlyfans: profileUrl };
    const platformsFound = ["onlyfans"];
    if (instagramUrl) {
      profileUrls.instagram = instagramUrl;
      platformsFound.push("instagram");
    }

    leads.push({
      handle: username,
      platform: "onlyfans",
      profileUrl,
      platformsFound,
      profileUrls,
      followerCount,
      engagementRate: followerCount > 0 ? 1 : 0,
      luxuryTagHits: 0,
      sampleUrls: sampleUrls.length ? sampleUrls : undefined,
    });
  });

  return { leads, cookies };
}

export async function scrapeJuicySearch(
  queries: string[] = DEFAULT_JUICYSEARCH_QUERIES,
  opts?: { withDiagnostics?: boolean }
): Promise<ScrapedLead[] | { leads: ScrapedLead[]; diagnostics: AggregatorDiagnostic[] }> {
  const allLeads: ScrapedLead[] = [];
  const seen = new Set<string>();
  const diagnostics: AggregatorDiagnostic[] = [];
  let cookieJar: string[] | undefined;

  for (const q of queries.slice(0, 8)) {
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

  const result = allLeads.slice(0, 3000);
  if (opts?.withDiagnostics) {
    return { leads: result, diagnostics };
  }
  return result;
}
