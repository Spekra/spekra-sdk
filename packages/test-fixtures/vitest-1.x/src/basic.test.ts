/**
 * Basic test fixture for Vitest reporter testing
 */
import { describe, it, expect } from 'vitest';

describe('Basic Tests', () => {
  it('should pass', () => {
    expect(1 + 1).toBe(2);
  });

  it('should also pass', () => {
    expect('hello').toContain('ell');
  });

  it.skip('should be skipped', () => {
    expect(true).toBe(false);
  });
});
