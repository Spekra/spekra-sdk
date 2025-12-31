/**
 * Flaky test fixture for retry detection testing
 *
 * Note: To test retry behavior, run with jest-retry or similar.
 * This simulates a test that may fail intermittently.
 */

describe('Flaky Tests', () => {
  // Simulate flaky behavior based on attempt count
  let attemptCount = 0;

  beforeEach(() => {
    attemptCount++;
  });

  afterAll(() => {
    attemptCount = 0;
  });

  it('simulates flaky behavior', () => {
    // This will fail on first attempt, pass on second
    // Only meaningful when running with jest retry enabled
    // For now, just pass to verify basic functionality
    expect(true).toBe(true);
  });

  it('should fail with error message', () => {
    // Intentionally failing test to verify error capture
    // Uncomment to test error handling:
    // expect(true).toBe(false);
    expect(true).toBe(true);
  });
});

