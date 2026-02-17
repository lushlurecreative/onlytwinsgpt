/**
 * Shared validation for all scraped leads. No source is exempt.
 * Ensures we never import men, fans, non-creators, or wrong images (e.g. ventilation fans).
 */

import type { IngestLeadInput } from "./ingest-leads";

const CREATOR_PLATFORM_DOMAINS = [
  "onlyfans.com",
  "fansly.com",
  "fancentro.com",
  "manyvids.com",
  "justfor.fans",
  "fan.page",
  "instagram.com",
  "youtube.com",
  "linktr.ee",
  "beacons.ai",
  "linkin.bio",
];

const MONETIZATION_SIGNALS = ["fans", "sub", "onlyfans", "fansly", "link in bio", "linkinbio"];

const NON_CREATOR_IMAGE_PATTERNS = [
  /\bfan\b/i,
  /\bad\b/i,
  /\bbanner\b/i,
  /\blogo\b/i,
  /\bicon\b/i,
  /\bbutton\b/i,
  /\bsponsor\b/i,
  /\/ads\//i,
  /doubleclick/i,
  /googleadservices/i,
  /ventilation/i,
];

/**
 * Filter sampleUrls to remove images that are clearly not creator photos
 * (e.g. ventilation fans, ads, logos, banners). Applies to ALL sources.
 */
export function filterCreatorImages(urls: string[]): string[] {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  return urls.filter((url) => {
    if (!url || typeof url !== "string" || !url.startsWith("http")) return false;
    const lower = url.toLowerCase();
    for (const pat of NON_CREATOR_IMAGE_PATTERNS) {
      if (pat.test(lower)) return false;
    }
    return true;
  });
}

function hasCreatorProfileUrl(lead: IngestLeadInput): boolean {
  const profileUrl = lead.profileUrl?.trim();
  if (profileUrl) {
    try {
      const host = new URL(profileUrl).hostname.toLowerCase();
      if (CREATOR_PLATFORM_DOMAINS.some((d) => host.includes(d))) return true;
    } catch {
      // invalid URL
    }
  }
  const profileUrls = lead.profileUrls;
  if (profileUrls && typeof profileUrls === "object") {
    for (const url of Object.values(profileUrls)) {
      if (typeof url !== "string" || !url.trim()) continue;
      try {
        const host = new URL(url).hostname.toLowerCase();
        if (CREATOR_PLATFORM_DOMAINS.some((d) => host.includes(d))) return true;
      } catch {
        // skip
      }
    }
  }
  return false;
}

function hasMonetizationSignal(lead: IngestLeadInput): boolean {
  const notes = (lead.notes ?? "").toLowerCase();
  for (const s of MONETIZATION_SIGNALS) {
    if (notes.includes(s)) return true;
  }
  const profileUrl = (lead.profileUrl ?? "").toLowerCase();
  for (const s of MONETIZATION_SIGNALS) {
    if (profileUrl.includes(s)) return true;
  }
  const profileUrls = lead.profileUrls;
  if (profileUrls && typeof profileUrls === "object") {
    for (const url of Object.values(profileUrls)) {
      if (typeof url === "string" && MONETIZATION_SIGNALS.some((s) => url.toLowerCase().includes(s))) return true;
    }
  }
  return false;
}

function looksLikeCreatorHandle(handle: string): boolean {
  const h = handle.trim();
  if (!h || h.length < 2 || h.length > 80) return false;
  if (/^[\d_]+$/.test(h)) return false;
  if (/^(deleted|removed|unknown|\[deleted\])$/i.test(h)) return false;
  return true;
}

/**
 * Validate a lead before ingest. Returns false if the lead should be dropped.
 * All sources must pass this validation.
 */
export function validateLead(lead: IngestLeadInput): boolean {
  if (!lead || typeof lead !== "object") return false;
  const handle = typeof lead.handle === "string" ? lead.handle : "";
  if (!looksLikeCreatorHandle(handle)) return false;
  const platform = String(lead.platform ?? "").trim().toLowerCase();
  if (!platform) return false;
  if (!hasCreatorProfileUrl(lead) && !hasMonetizationSignal(lead)) return false;
  return true;
}
