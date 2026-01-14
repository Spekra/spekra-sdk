import type { ResolvedRedactionConfig, RedactionPattern } from '../../types';
import { BaseService } from './base.service';
import { LoggerService } from './logger.service';

/**
 * Default redaction patterns for common PII/secrets.
 * These provide baseline protection for common sensitive data.
 */
const DEFAULT_PATTERNS: RegExp[] = [
  // API keys and tokens (common formats)
  /\b[A-Za-z0-9_-]{20,}\b(?=.*key|.*token|.*secret|.*api)/i,
  /\b(sk|pk|api|key|token|secret|password|pwd|auth)[_-]?[A-Za-z0-9_-]{16,}\b/i,

  // Bearer tokens
  /Bearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi,

  // JWT tokens
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,

  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // Credit card numbers (basic pattern)
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

  // SSN (US Social Security Number)
  /\b\d{3}-\d{2}-\d{4}\b/g,

  // Phone numbers (various formats)
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,

  // AWS access keys
  /\bAKIA[0-9A-Z]{16}\b/g,

  // GitHub tokens
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g,

  // Generic password in URLs
  /(:\/\/[^:]+:)[^@]+(@)/g,
];

const REDACTION_PLACEHOLDER = '[REDACTED]';

/**
 * PII redaction engine with configurable patterns.
 * Applies to error messages, console output, and other text data.
 * Client-side only - PII never leaves the machine unredacted.
 */
export class RedactionService extends BaseService {
  private readonly enabled: boolean;
  private readonly patterns: RegExp[];

  constructor(config: ResolvedRedactionConfig, logger: LoggerService) {
    super(logger);
    this.enabled = config.enabled;
    this.patterns = this.buildPatterns(config.patterns, config.replaceBuiltIn);

    if (this.enabled) {
      this.logger.verbose('Redaction enabled', {
        patternCount: this.patterns.length,
        customPatterns: config.patterns.length,
        builtInReplaced: config.replaceBuiltIn,
      });
    } else {
      this.logger.warn('Redaction DISABLED - PII may be sent to server');
    }
  }

  /**
   * Redact sensitive information from a string
   */
  redact(text: string | null | undefined): string | null {
    if (!this.enabled || !text) {
      return text ?? null;
    }

    let result = text;
    for (const pattern of this.patterns) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      result = result.replace(pattern, REDACTION_PLACEHOLDER);
    }

    return result;
  }

  /**
   * Redact sensitive information from an array of strings
   */
  redactArray(items: string[]): string[] {
    if (!this.enabled) {
      return items;
    }
    return items.map((item) => this.redact(item) ?? '');
  }

  /**
   * Redact URL query parameters and credentials
   */
  redactUrl(url: string | null | undefined): string | null {
    if (!this.enabled || !url) {
      return url ?? null;
    }

    try {
      const parsed = new URL(url);

      // Redact password in URL
      if (parsed.password) {
        parsed.password = REDACTION_PLACEHOLDER;
      }

      // Redact sensitive query parameters
      const sensitiveParams = [
        'token',
        'key',
        'api_key',
        'apikey',
        'secret',
        'password',
        'pwd',
        'auth',
        'access_token',
        'refresh_token',
      ];

      for (const param of sensitiveParams) {
        if (parsed.searchParams.has(param)) {
          parsed.searchParams.set(param, REDACTION_PLACEHOLDER);
        }
      }

      return parsed.toString();
    } catch {
      // If URL parsing fails, apply general redaction
      return this.redact(url);
    }
  }

  /**
   * Build regex patterns from config.
   * Converts string patterns to case-insensitive RegExp.
   */
  private buildPatterns(customPatterns: RedactionPattern[], replaceBuiltIn: boolean): RegExp[] {
    // Start with built-in patterns unless explicitly replaced
    const patterns: RegExp[] = replaceBuiltIn ? [] : [...DEFAULT_PATTERNS];

    // Add custom patterns
    for (const pattern of customPatterns) {
      if (typeof pattern === 'string') {
        // Escape special regex characters in string patterns
        // Match the exact string case-insensitively
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        patterns.push(new RegExp(escaped, 'gi'));
      } else {
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  /**
   * Check if redaction is enabled
   */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get number of active patterns
   */
  get patternCount(): number {
    return this.patterns.length;
  }
}

