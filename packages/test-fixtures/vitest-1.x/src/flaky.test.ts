/**
 * Flaky test fixture for retry testing
 *
 * This test is designed to fail on first attempt and pass on retry.
 * Enable retries in vitest.config.ts to test retry behavior.
 */
import { describe, it, expect } from 'vitest';

let attemptCount = 0;

describe('Flaky Tests', () => {
  it('should pass on second attempt', () => {
    attemptCount++;
    // Pass on second attempt (or if retries are disabled, this will fail)
    if (attemptCount === 1 && process.env.VITEST_RETRY) {
      throw new Error('Simulated flaky failure');
    }
    expect(true).toBe(true);
  });

  it('consistently passing test', () => {
    expect(2 + 2).toBe(4);
  });
});
