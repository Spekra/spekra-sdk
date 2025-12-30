import { LoggerService } from './logger.service';

/**
 * Abstract base class for all infrastructure services.
 * Provides logger injection for consistent logging.
 */
export abstract class BaseService {
  protected readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }
}
