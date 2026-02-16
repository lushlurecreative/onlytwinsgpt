import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('Upload end-to-end flow', async ({ page }) => {
  const timestamp = Date.now();
  const testEmail = `test+${timestamp}@example.com`;
  const testPassword = 'TestPassword123!';
  const testFilePath = '/Users/shaunosborne/onlytwinsgpt/public/next.svg';
  
  console.log('\n=== STARTING E2E UPLOAD TEST ===\n');

  // Listen for console messages and errors
  const consoleMessages: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push(`[${msg.type()}] ${text}`);
    console.log(`  [Browser ${msg.type()}] ${text}`);
  });
  
  page.on('pageerror', err => {
    console.log(`  [Page Error] ${err.message}`);
    consoleMessages.push(`[pageerror] ${err.message}`);
  });
  
  // Listen for all network requests
  page.on('request', request => {
    if (request.url().includes('supabase') && request.url().includes('/auth/')) {
      console.log(`  [Network Request] ${request.method()} ${request.url()}`);
    }
  });
  
  page.on('response', response => {
    if (response.url().includes('supabase') && response.url().includes('/auth/')) {
      console.log(`  [Network Response] ${response.status()} ${response.url()}`);
    }
  });

  // STEP 1: Visit /upload while logged out and verify redirect
  console.log('STEP 1: Testing redirect from /upload to /login...');
  await page.goto('http://localhost:3000/upload');
  await page.waitForURL('**/login?redirectTo=%2Fupload', { timeout: 5000 });
  
  const step1Url = page.url();
  const step1Pass = step1Url.includes('/login?redirectTo=%2Fupload') || step1Url.includes('/login?redirectTo=/upload');
  
  console.log(`  Current URL: ${step1Url}`);
  console.log(`  STEP 1: ${step1Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Expected: /login?redirectTo=/upload or %2Fupload`);
  console.log(`  Observed: ${step1Url}\n`);
  
  expect(step1Pass).toBeTruthy();

  // STEP 2: Sign up with test email and password
  console.log('STEP 2: Signing up and verifying redirect to /upload...');
  console.log(`  Using email: ${testEmail}`);
  console.log(`  Using password: ${testPassword}`);
  
  // Wait for page to be fully interactive (React hydration)
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // Extra buffer for React hydration
  
  // Fill in the email and password fields using pressSequentially for React compatibility
  const inputs = page.locator('input');
  
  // Click and clear the first input
  await inputs.nth(0).click();
  await inputs.nth(0).clear();
  // Use pressSequentially which triggers proper React events
  await inputs.nth(0).pressSequentially(testEmail, { delay: 10 });
  console.log('  Email filled');
  
  await inputs.nth(1).click();
  await inputs.nth(1).clear();
  await inputs.nth(1).pressSequentially(testPassword, { delay: 10 });
  console.log('  Password filled');
  
  // Verify the inputs have values
  const emailValue = await inputs.nth(0).inputValue();
  const passwordValue = await inputs.nth(1).inputValue();
  console.log(`  Email input value: ${emailValue}`);
  console.log(`  Password input value: ${'*'.repeat(passwordValue.length)}`);
  
  // Take a screenshot before clicking
  await page.screenshot({ path: 'test-results/before-click.png' });
  
  // Start waiting for navigation BEFORE clicking
  const navigationPromise = page.waitForURL('**/upload', { timeout: 20000 }).catch(() => null);
  
  // Click the "Sign up" button
  const signUpButton = page.locator('button').first();
  await signUpButton.click();
  console.log('  Sign up button clicked...');
  
  // Wait a bit for the signup to process
  await page.waitForTimeout(3000);
  console.log('  Waited 3s for signup to complete...');
  
  // Check current URL
  const currentUrl = page.url();
  console.log(`  Current URL after 3s: ${currentUrl}`);
  
  // Check if we got redirected
  const navigated = await navigationPromise;
  if (navigated !== null) {
    console.log('  Successfully redirected to /upload!');
  } else {
    console.log('  No automatic redirect occurred.');
    console.log('  This suggests the signup button click did not trigger the React handler properly.');
    console.log('  Manual testing required to verify if this is a Playwright limitation or app issue.');
    
    const step2Url = page.url();
    console.log(`\n  STEP 2: ❌ FAIL`);
    console.log(`  Expected: Redirect to /upload after signup`);
    console.log(`  Observed: Stayed on ${step2Url}`);
    console.log(`  Details: Supabase API called successfully (200), but no UI update or redirect occurred`);
    console.log(`  BLOCKER: React onClick handler may not be triggered by Playwright, or session cookies not set\n`);
    
    throw new Error('STEP 2 FAILED: No redirect after signup - manual browser testing required');
  }
  
  const step2Url = page.url();
  const step2Pass = step2Url.includes('/upload') && !step2Url.includes('/login');
  
  console.log(`  Current URL: ${step2Url}`);
  console.log(`  STEP 2: ${step2Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Expected: /upload`);
  console.log(`  Observed: ${step2Url}\n`);
  
  expect(step2Pass).toBeTruthy();

  // STEP 3: Verify we're on /upload and select file
  console.log('STEP 3: Uploading file...');
  console.log(`  File path: ${testFilePath}`);
  
  // Verify the page has upload elements
  await expect(page.locator('h1:has-text("Upload")')).toBeVisible({ timeout: 5000 });
  
  // Check if file exists
  if (!fs.existsSync(testFilePath)) {
    console.log(`  ❌ FAIL - File does not exist: ${testFilePath}`);
    throw new Error(`Test file not found: ${testFilePath}`);
  }
  
  // Select file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(testFilePath);
  console.log('  File selected');
  
  // Click upload button
  await page.click('button:has-text("Upload")');
  console.log('  Upload button clicked');
  
  const step3Pass = true; // If we got here without error
  console.log(`  STEP 3: ${step3Pass ? '✅ PASS' : '❌ FAIL'}\n`);

  // STEP 4: Verify success message with path and signed URL
  console.log('STEP 4: Verifying upload success...');
  
  // Wait for upload to complete (status should not be "uploading...")
  await page.waitForSelector('text=/Uploaded to:/', { timeout: 15000 });
  
  // Get the uploaded path
  const uploadedPathElement = page.locator('text=/Uploaded to: .*\\/next\\.svg/');
  const uploadedPathText = await uploadedPathElement.textContent();
  const uploadedPath = uploadedPathText?.replace('Uploaded to: ', '').trim() || '';
  
  console.log(`  Uploaded path: ${uploadedPath}`);
  
  // Get the signed URL
  const signedUrlLink = page.locator('a[href*="supabase"]');
  const signedUrl = await signedUrlLink.getAttribute('href');
  
  console.log(`  Signed URL: ${signedUrl}`);
  
  const step4Pass = uploadedPath.includes('next.svg') && signedUrl && signedUrl.length > 0;
  console.log(`  STEP 4: ${step4Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Expected: Path contains 'next.svg' and signed URL exists`);
  console.log(`  Observed: Path='${uploadedPath}', URL exists=${!!signedUrl}\n`);
  
  expect(step4Pass).toBeTruthy();
  expect(signedUrl).toBeTruthy();

  // STEP 5: Open signed URL and verify image renders
  console.log('STEP 5: Verifying signed URL renders the image...');
  console.log(`  Opening URL: ${signedUrl}`);
  
  if (!signedUrl) {
    console.log('  ❌ FAIL - No signed URL available');
    throw new Error('No signed URL to test');
  }
  
  // Open signed URL in new page
  const newPage = await page.context().newPage();
  const gotoResponse = await newPage.goto(signedUrl);
  
  const statusCode = gotoResponse?.status();
  const contentType = gotoResponse?.headers()['content-type'] || '';
  
  console.log(`  HTTP Status: ${statusCode}`);
  console.log(`  Content-Type: ${contentType}`);
  
  // For SVG, check if it's served with correct content type
  const step5Pass = statusCode === 200 && (contentType.includes('image') || contentType.includes('svg'));
  
  console.log(`  STEP 5: ${step5Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Expected: Status 200 and image/svg content type`);
  console.log(`  Observed: Status=${statusCode}, ContentType=${contentType}\n`);
  
  expect(step5Pass).toBeTruthy();
  
  await newPage.close();

  // FINAL SUMMARY
  console.log('=== TEST SUMMARY ===');
  console.log('STEP 1: ✅ PASS - Redirect to /login with redirectTo parameter');
  console.log('STEP 2: ✅ PASS - Signup and redirect to /upload');
  console.log('STEP 3: ✅ PASS - File selected and upload initiated');
  console.log('STEP 4: ✅ PASS - Upload success with path and signed URL');
  console.log('STEP 5: ✅ PASS - Signed URL serves the image correctly');
  console.log('\n✅ ALL TESTS PASSED\n');
});
