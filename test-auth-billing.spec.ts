import { test, expect } from "@playwright/test";

/**
 * test-auth-billing.spec.ts
 * Coverage for: login UI, signup UI, thank-you page states, checkout return,
 * and upload smoke flow (requires app running: npm run dev).
 *
 * These tests run without a logged-in session — they cover the unauthenticated
 * surface area and the UI contract for key flows.
 *
 * For subscriber-specific gating, see test-gating.spec.ts.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// ── Login page ───────────────────────────────────────────────────────────────

test.describe("Login page", () => {
  test("renders email + password inputs and action buttons", async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await expect(page.locator("input").first()).toBeVisible();
    // At least one input of type password
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // Sign in and Sign up buttons present
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign up/i }).first()).toBeVisible();
  });

  test("shows error on bad credentials", async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    const inputs = page.locator("input");
    await inputs.nth(0).fill("notauser@example.com");
    await inputs.nth(1).fill("badpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Should show some error message (❌ prefix from the UI)
    await expect(page.locator("p").filter({ hasText: /❌|invalid|error|credential/i })).toBeVisible({
      timeout: 8000,
    });
  });

  test("Google OAuth button is present", async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /google/i }).first()).toBeVisible();
  });
});

// ── Thank-you page ───────────────────────────────────────────────────────────

test.describe("Thank-you page", () => {
  test("without ot_checkout_sid cookie — /api/thank-you/session returns 400", async ({ request }) => {
    const res = await request.get(`${BASE}/api/thank-you/session`);
    expect(res.status()).toBe(400);
    const body = await res.json() as { state?: string; reason?: string };
    expect(body.state).toBe("error");
    expect(body.reason).toBe("sid_missing");
  });

  test("with invalid session id — /api/thank-you/session returns 400", async ({ request }) => {
    const res = await request.get(`${BASE}/api/thank-you/session?sid=cs_invalid_fake_session`);
    // Stripe will reject the invalid session — should return 400 with error state
    expect(res.status()).toBe(400);
    const body = await res.json() as { state?: string };
    expect(body.state).toBe("error");
  });

  test("page loads and shows support contact in error state (no sid cookie)", async ({ page }) => {
    await page.goto(`${BASE}/thank-you`, { waitUntil: "networkidle" });
    // Without ot_checkout_sid cookie, page transitions to error state showing WhatsApp support link.
    // Wait for the animated wrapper to settle and the error state to render.
    await expect(page.getByRole("link", { name: /whatsapp/i }).first()).toBeVisible({ timeout: 10000 });
  });
});

// ── Admin boundary (authenticated path) ────────────────────────────────────
// Unauthenticated cases already in test-gating.spec.ts.
// Here we verify the /api/admin/session endpoint correctly rejects non-admin calls.

test.describe("Admin API boundary", () => {
  test("/api/admin/session without auth → unauthenticated response", async ({ request }) => {
    // /api/admin/session is a status check endpoint — returns 200 with authenticated: false when not logged in
    const res = await request.get(`${BASE}/api/admin/session`);
    expect(res.status()).toBe(200);
    const body = await res.json() as { authenticated?: boolean; isAdmin?: boolean };
    expect(body.authenticated).toBe(false);
    expect(body.isAdmin).toBe(false);
  });

  test("/api/admin/users without auth → 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/users`);
    expect(res.status()).toBe(401);
  });

  test("/api/admin/revenue without auth → 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/revenue`);
    expect(res.status()).toBe(401);
  });

  test("/api/admin/webhook-health without auth → 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/webhook-health`);
    expect(res.status()).toBe(401);
  });

  test("/api/admin/kpis without auth → 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/kpis`);
    expect(res.status()).toBe(401);
  });
});

// ── Upload smoke (unauthenticated) ──────────────────────────────────────────
// API-level: upload route should refuse unauthenticated submissions.

test.describe("Upload route", () => {
  test("/upload page redirects to /login (middleware guard)", async ({ page }) => {
    await page.goto(`${BASE}/upload`, { waitUntil: "networkidle" });
    expect(page.url()).toContain("/login");
  });

  test("/api/generate or upload API without auth returns 401 or redirect", async ({ request }) => {
    // Check that the main upload API rejects unauthenticated requests
    const res = await request.post(`${BASE}/api/uploads`, {
      multipart: {
        file: {
          name: "test.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), // minimal JPEG header
        },
      },
    });
    // Should be 401 (no auth) — not 500 or 200
    expect([401, 403, 400]).toContain(res.status());
  });
});

// ── Billing checkout API ────────────────────────────────────────────────────

test.describe("Checkout API", () => {
  test("POST /api/billing/checkout without plan → 401 (non-guest path)", async ({ request }) => {
    const res = await request.post(`${BASE}/api/billing/checkout`, {
      data: { successUrl: "https://example.com" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/billing/checkout with valid plan → returns Stripe URL (guest checkout)", async ({ request }) => {
    const res = await request.post(`${BASE}/api/billing/checkout`, {
      data: { plan: "starter" },
    });
    // Guest checkout should succeed and return a Stripe URL
    expect(res.status()).toBe(200);
    const body = await res.json() as { url?: string };
    expect(typeof body.url).toBe("string");
    expect(body.url).toContain("stripe.com");
  });
});
