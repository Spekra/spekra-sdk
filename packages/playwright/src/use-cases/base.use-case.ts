import { LoggerService } from '../infrastructure/services/logger.service';

/**
 * Result type for use case execution
 */
export type UseCaseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

/**
 * Abstract base class for all use cases.
 * Enforces single `execute` method pattern with typed result.
 * Use cases orchestrate business logic and delegate to services/clients.
 */
export abstract class BaseUseCase<TInput, TOutput> {
  protected readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * Execute the use case with the given input
   */
  abstract execute(input: TInput): UseCaseResult<TOutput> | Promise<UseCaseResult<TOutput>>;
}
