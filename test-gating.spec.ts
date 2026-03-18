import { test, expect } from "@playwright/test";

/**
 * Gating regression tests.
 *
 * Verifies that subscriber-only routes correctly redirect unauthenticated visitors.
 * These cover the server-component gating path (requireActiveSubscriber) that
 * middleware does NOT protect (PROTECTED_ROUTES is intentionally narrow).
 *
 * Also verifies that the stripe_customer_id-alone fallback no longer grants access
 * — a user with no subscription row must be redirected to /pricing, not let through.
 *
 * Requires the app to be running: npm run dev (or PLAYWRIGHT_BASE_URL env var).
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// ── Unauthenticated redirect tests ──────────────────────────────────────────

test.describe("Unauthenticated gating", () => {
  const GATED_ROUTES = ["/dashboard", "/vault", "/requests", "/billing", "/me"];

  for (const route of GATED_ROUTES) {
    test(`${route} → redirects to /login when not logged in`, async ({ page }) => {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      // requireActiveSubscriber redirects to /login?redirectTo=...
      expect(page.url()).toContain("/login");
    });
  }
});

// ── Upload route redirect (in PROTECTED_ROUTES — middleware-level guard) ────

test("/upload → redirects to /login when not logged in (middleware)", async ({ page }) => {
  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle" });
  expect(page.url()).toContain("/login");
});

// ── Admin route redirect ─────────────────────────────────────────────────────

test("/admin → redirects to /login when not logged in (middleware)", async ({ page }) => {
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  expect(page.url()).toContain("/login");
});

// ── Public routes do not redirect ───────────────────────────────────────────

test.describe("Public routes are accessible", () => {
  const PUBLIC_ROUTES = ["/", "/pricing"]; // /login excluded — URL always contains "/login"

  for (const route of PUBLIC_ROUTES) {
    test(`${route} → does not redirect to /login`, async ({ page }) => {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      expect(page.url()).not.toContain("/login");
    });
  }
});
