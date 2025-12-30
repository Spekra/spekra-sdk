import { describe, it, expect } from 'vitest';
import { BaseEntity } from '../../../../src/domain/entities/base.entity';

// Test class to test BaseEntity abstract class
class TestEntity extends BaseEntity<{ value: string; count: number }> {
  constructor(props: { value: string; count: number }) {
    super(props);
  }

  static create(value: string, count: number): TestEntity {
    return new TestEntity({ value, count });
  }
}

describe('BaseEntity', () => {
  describe('toObject', () => {
    it('should return a shallow copy of props', () => {
      const entity = TestEntity.create('test', 42);
      const obj = entity.toObject();

      expect(obj).toEqual({ value: 'test', count: 42 });
    });

    it('should return a copy not the original', () => {
      const entity = TestEntity.create('test', 42);
      const obj1 = entity.toObject();
      const obj2 = entity.toObject();

      expect(obj1).not.toBe(obj2);
      expect(obj1).toEqual(obj2);
    });
  });

  describe('equals', () => {
    it('should return true for entities with same props', () => {
      const entity1 = TestEntity.create('test', 42);
      const entity2 = TestEntity.create('test', 42);

      expect(entity1.equals(entity2)).toBe(true);
    });

    it('should return false for entities with different props', () => {
      const entity1 = TestEntity.create('test', 42);
      const entity2 = TestEntity.create('test', 43);

      expect(entity1.equals(entity2)).toBe(false);
    });

    it('should return false for completely different props', () => {
      const entity1 = TestEntity.create('foo', 1);
      const entity2 = TestEntity.create('bar', 2);

      expect(entity1.equals(entity2)).toBe(false);
    });
  });
});
