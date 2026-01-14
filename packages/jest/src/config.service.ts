/**
 * Configuration service for Jest reporter
 */

import type { LoggerService } from '@spekra/core';
import type { SpekraJestOptions, ResolvedConfig } from './types';

/**
 * Default configuration values
 */
export const DEFAULTS = {
  apiUrl: 'https://spekra.dev/api/v1/reports',
  enabled: true,
  debug: false,
  failOnError: false,
  timeout: 15000,
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 10000,
};

/**
 * Environment variable names for Jest-specific config
 */
const ENV_VARS = {
  apiKey: ['SPEKRA_JEST_API_KEY', 'SPEKRA_API_KEY'],
  source: ['SPEKRA_JEST_SOURCE', 'SPEKRA_SOURCE'],
  apiUrl: ['SPEKRA_JEST_API_URL', 'SPEKRA_API_URL'],
  enabled: ['SPEKRA_JEST_ENABLED', 'SPEKRA_ENABLED'],
  debug: ['SPEKRA_JEST_DEBUG', 'SPEKRA_DEBUG'],
  failOnError: ['SPEKRA_JEST_FAIL_ON_ERROR'],
};

/**
 * Configuration service for resolving and validating Jest reporter options
 */
export class ConfigService {
  private static _instance: ConfigService;

  static instance(): ConfigService {
    if (!ConfigService._instance) {
      ConfigService._instance = new ConfigService();
    }
    return ConfigService._instance;
  }

  /**
   * Resolve configuration from options and environment variables
   */
  resolve(options: SpekraJestOptions): ResolvedConfig {
    return {
      apiKey: this.resolveString(options.apiKey, ENV_VARS.apiKey) ?? '',
      source: this.resolveString(options.source, ENV_VARS.source) ?? '',
      apiUrl: this.resolveString(options.apiUrl, ENV_VARS.apiUrl) ?? DEFAULTS.apiUrl,
      enabled: this.resolveBoolean(options.enabled, ENV_VARS.enabled) ?? DEFAULTS.enabled,
      debug: this.resolveBoolean(options.debug, ENV_VARS.debug) ?? DEFAULTS.debug,
      failOnError:
        this.resolveBoolean(options.failOnError, ENV_VARS.failOnError) ?? DEFAULTS.failOnError,
      onError: options.onError ?? null,
      onMetrics: options.onMetrics ?? null,
    };
  }

  /**
   * Check if reporter is ready to run
   */
  isReady(config: ResolvedConfig): { ready: boolean; reason?: string } {
    // Check if disabled
    if (!config.enabled) {
      return { ready: false, reason: 'disabled' };
    }

    // Check for API key
    if (!config.apiKey) {
      return {
        ready: false,
        reason:
          'Missing API key. Set apiKey option or SPEKRA_JEST_API_KEY / SPEKRA_API_KEY environment variable.',
      };
    }

    // Check for source (required for Jest)
    if (!config.source) {
      return {
        ready: false,
        reason:
          'Missing source. Set source option or SPEKRA_JEST_SOURCE environment variable. Source is required to identify your test suite.',
      };
    }

    return { ready: true };
  }

  /**
   * Validate configuration and log warnings
   */
  validate(config: ResolvedConfig, logger: LoggerService): void {
    // Warn if source looks like a placeholder
    if (config.source && /^(test|my-|example|placeholder)/i.test(config.source)) {
      logger.warn(
        `Source "${config.source}" looks like a placeholder. Use a descriptive name like "frontend-unit-tests".`
      );
    }

    // Warn if API URL is not HTTPS in production
    if (config.apiUrl && !config.apiUrl.startsWith('https://') && !config.debug) {
      logger.warn('API URL is not using HTTPS. This may expose your API key.');
    }
  }

  // ============================================================================
  // Private: Resolution helpers
  // ============================================================================

  private resolveString(option: string | undefined, envVars: string[]): string | undefined {
    // Option takes priority
    if (option !== undefined) {
      return option;
    }

    // Try environment variables in order
    for (const envVar of envVars) {
      const value = process.env[envVar];
      if (value !== undefined && value !== '') {
        return value;
      }
    }

    return undefined;
  }

  private resolveBoolean(option: boolean | undefined, envVars: string[]): boolean | undefined {
    // Option takes priority
    if (option !== undefined) {
      return option;
    }

    // Try environment variables in order
    for (const envVar of envVars) {
      const value = process.env[envVar];
      if (value !== undefined) {
        return value.toLowerCase() !== 'false' && value !== '0';
      }
    }

    return undefined;
  }
}

