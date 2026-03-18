import { test } from '@playwright/test';
test('visual check', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/v_gate.png' });
  await page.click('.ug-sample');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/v_chip.png' });
  await page.evaluate(() => window.scrollBy(0, 1200));
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/v_iphone.png' });
  await page.evaluate(() => window.scrollBy(0, 3200));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/v_grid.png' });
});
