/**
 * Abstract base class for all domain entities.
 * Enforces factory pattern and common entity behavior.
 */
export abstract class BaseEntity<TProps> {
  protected readonly props: TProps;

  /**
   * Protected constructor - subclasses must use static factory methods
   */
  protected constructor(props: TProps) {
    this.props = props;
  }

  /**
   * Get a plain object representation of props
   */
  toObject(): TProps {
    return { ...this.props };
  }

  /**
   * Check equality with another entity
   * Override in subclass if entity has an ID field
   */
  equals(other: BaseEntity<TProps>): boolean {
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
