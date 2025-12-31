/**
 * Basic test fixture for Jest reporter testing
 */

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

