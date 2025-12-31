/**
 * Nested describe blocks for suite path testing
 */

describe('Outer Suite', () => {
  describe('Inner Suite', () => {
    describe('Deep Nested Suite', () => {
      it('should track full suite path', () => {
        expect([1, 2, 3]).toHaveLength(3);
      });
    });

    it('should track partial suite path', () => {
      expect({ a: 1 }).toHaveProperty('a');
    });
  });

  it('should track shallow suite path', () => {
    expect(true).toBeTruthy();
  });
});

