import { test, expect } from '@playwright/test';

/**
 * Regression tests for feed gating: public feed and creator feed (public mode)
 * must return only public posts. Run with: npx playwright test test-feed-gating.spec.ts
 * Requires the app to be running (e.g. npm run dev).
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

test('Public feed API returns only public posts', async ({ request }) => {
  const res = await request.get(`${BASE}/api/feed`);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body).toHaveProperty('posts');
  expect(Array.isArray(body.posts)).toBe(true);
  for (const post of body.posts) {
    expect(post.visibility).toBe('public');
  }
});

test('Creator feed with mode=public returns only public posts', async ({ request }) => {
  // Use a valid UUID format; may return empty if creator has no posts
  const creatorId = '00000000-0000-4000-8000-000000000001';
  const res = await request.get(`${BASE}/api/feed/creator/${creatorId}?mode=public`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  if (body.posts && Array.isArray(body.posts)) {
    for (const post of body.posts) {
      expect(post.visibility).toBe('public');
    }
  }
});
