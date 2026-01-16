/**
 * Nested describe blocks test fixture
 */
import { describe, it, expect } from 'vitest';

describe('Outer Suite', () => {
  describe('Inner Suite', () => {
    it('deeply nested test', () => {
      expect(true).toBe(true);
    });

    describe('Even Deeper', () => {
      it('very deeply nested test', () => {
        expect([1, 2, 3]).toContain(2);
      });
    });
  });

  it('outer level test', () => {
    expect('string').toHaveLength(6);
  });
});
