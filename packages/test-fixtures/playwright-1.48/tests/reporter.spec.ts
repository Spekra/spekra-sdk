import { test, expect } from '@playwright/test';

/**
 * Fixture tests to verify SpekraReporter works correctly with Playwright 1.48+.
 * These tests exercise different test outcomes that the reporter should handle.
 * Uses data URLs to avoid network dependencies.
 *
 * Playwright 1.42+ added the tag option: test('name', { tag: '@tag' }, ...)
 * This fixture verifies tag extraction works correctly.
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

// ============================================================================
// Tag Annotation Tests (Playwright 1.42+ feature)
// ============================================================================

test.describe('Tag annotations', () => {
  // Single tag using the tag option (1.42+ API)
  test('test with single tag', { tag: '@smoke' }, async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toBeVisible();
  });

  // Multiple tags using array syntax
  test('test with multiple tags', { tag: ['@regression', '@critical'] }, async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toBeVisible();
  });

  // Inline tag in title (fallback method)
  test('inline tag test @legacy', async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toBeVisible();
  });

  // Both annotation tag and inline tag
  test('combined tags @inline', { tag: '@annotation' }, async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toBeVisible();
  });
});

// Note: test.describe.configure({ tag }) was added in Playwright 1.49+
// For 1.48, we only test the test-level tag option

test.describe('Test with annotations', () => {
  test('slow test @slow', async ({ page }) => {
    test.slow();
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toBeVisible();
  });
});

// ============================================================================
// Failure Scenarios (for testing error handling)
// ============================================================================

test.describe('Failure Scenarios @failures', () => {
  // Intentional failure with assertion error
  test.fail('expected failure - element not found', async ({ page }) => {
    await page.goto(TEST_PAGE);
    // This element doesn't exist, so the assertion will fail
    await expect(page.locator('#nonexistent-element')).toBeVisible({ timeout: 1000 });
  });

  // Intentional failure with wrong text
  test.fail('expected failure - wrong text content', async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toContainText('Wrong Expected Text', { timeout: 1000 });
  });
});

// ============================================================================
// Screenshot & Attachment Tests
// ============================================================================

test.describe('Attachment Tests @attachments', () => {
  test('test with screenshot on success', async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toBeVisible();
    // Take a screenshot that will be collected as attachment
    await page.screenshot({ path: 'test-results/success-screenshot.png' });
  });

  test('test with custom attachment', async ({ page }, testInfo) => {
    await page.goto(TEST_PAGE);
    // Add a custom text attachment
    await testInfo.attach('custom-data', {
      body: JSON.stringify({ key: 'value', timestamp: Date.now() }),
      contentType: 'application/json',
    });
    await expect(page.locator('h1')).toBeVisible();
  });
});

// ============================================================================
// Error Context Tests
// ============================================================================

test.describe('Error Context Tests @errors', () => {
  test('test with console output', async ({ page }) => {
    await page.goto(TEST_PAGE);
    // Log some messages to console
    await page.evaluate(() => {
      console.log('Test log message');
      console.warn('Test warning message');
    });
    await expect(page.locator('h1')).toBeVisible();
  });

  test('test with steps', async ({ page }) => {
    await test.step('Navigate to page', async () => {
      await page.goto(TEST_PAGE);
    });
    
    await test.step('Verify header', async () => {
      await expect(page.locator('h1')).toContainText('Hello World');
    });
    
    await test.step('Nested steps', async () => {
      await test.step('Inner step 1', async () => {
        await expect(page.locator('body')).toBeVisible();
      });
      await test.step('Inner step 2', async () => {
        await expect(page).toHaveTitle('Test Page');
      });
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

test.describe('Edge Cases', () => {
  test('test with very long title that might need truncation in reports because it contains a lot of information about what the test does and verifies', async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('test with special characters: <>&"\'`${}[]', async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('test with unicode: 日本語 中文 🎉 émojis', async ({ page }) => {
    await page.goto(TEST_PAGE);
    await expect(page.locator('h1')).toBeVisible();
  });

  // Zero duration test (practically instant)
  test('instant test', async () => {
    expect(true).toBe(true);
  });
});
