import { test, expect } from '@playwright/test';

/**
 * Fixture tests to verify SpekraReporter works correctly with Playwright.
 * These tests exercise different test outcomes that the reporter should handle.
 * Uses data URLs to avoid network dependencies.
 */

const TEST_PAGE = `data:text/html,<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <h1>Hello World</h1>
  <p>This is a test page</p>
</body>
</html>`;

test.describe('Reporter Fixture Tests', () => {
  test('passing test', async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toContainText('Hello World');
  });

  test('passing test with multiple assertions', async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('body')).toContainText('test page');
    await expect(page).toHaveTitle('Test Page');
  });

  test.skip('skipped test', async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toContainText('This test is skipped');
  });

  test('test with retry behavior', async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toContainText('Hello World');
  });
});

test.describe('Nested Suite', () => {
  test.describe('Deeply Nested', () => {
    test('nested test', async ({ page }) => {
      await page.goto(TEST_PAGE);
      await expect(page.locator('body')).toBeVisible();
    });
  });
});

test.describe('Test with annotations', () => {
  test('slow test @slow', async ({ page }) => {
    test.slow();
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toBeVisible();
  });
});
