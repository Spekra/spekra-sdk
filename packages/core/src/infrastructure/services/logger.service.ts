export interface LoggerConfig {
  debug?: boolean;
  prefix?: string;
}

/**
 * Consistent [Spekra] prefixed logging for the reporter.
 * Supports debug mode for verbose output.
 */
export class LoggerService {
  private readonly debug: boolean;
  private readonly prefix: string;

  constructor(config: LoggerConfig = {}) {
    this.debug = config.debug ?? false;
    this.prefix = config.prefix ?? 'Spekra';
  }

  /**
   * Log an info message (always shown)
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  /**
   * Log a warning message (always shown)
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  /**
   * Log an error message (always shown)
   */
  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullContext = error ? { ...context, error: errorMessage } : context;
    this.log('error', message, fullContext);
  }

  /**
   * Log a debug message (only shown when debug mode is enabled)
   */
  verbose(message: string, context?: Record<string, unknown>): void {
    if (this.debug) {
      this.log('debug', message, context);
    }
  }

  private log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    context?: Record<string, unknown>
  ): void {
    const formattedMessage = `[${this.prefix}] ${message}`;

    if (context && Object.keys(context).length > 0) {
      const contextStr = Object.entries(context)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ');

      switch (level) {
        case 'warn':
          console.warn(`${formattedMessage} ${contextStr}`);
          break;
        case 'error':
          console.error(`${formattedMessage} ${contextStr}`);
          break;
        default:
          console.log(`${formattedMessage} ${contextStr}`);
      }
    } else {
      switch (level) {
        case 'warn':
          console.warn(formattedMessage);
          break;
        case 'error':
          console.error(formattedMessage);
          break;
        default:
          console.log(formattedMessage);
      }
    }
  }
}

