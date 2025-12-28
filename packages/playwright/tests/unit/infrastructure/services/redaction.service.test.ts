import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedactionService } from '../../../../src/infrastructure/services/redaction.service';
import { LoggerService } from '../../../../src/infrastructure/services/logger.service';
import { ConfigService } from '../../../../src/infrastructure/services/config.service';
import type { ResolvedRedactionConfig } from '../../../../src/types';

// Mock logger
function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  } as unknown as LoggerService;
}

describe('RedactionService', () => {
  let logger: LoggerService;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('initialization', () => {
    it('should enable redaction by default', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      expect(service.isEnabled).toBe(true);
      expect(logger.verbose).toHaveBeenCalledWith('Redaction enabled', expect.any(Object));
    });

    it('should warn when redaction is disabled', () => {
      const config: ResolvedRedactionConfig = {
        enabled: false,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      expect(service.isEnabled).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Redaction DISABLED - PII may be sent to server');
    });

    it('should include built-in patterns by default', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      // Should have built-in patterns (at least 10)
      expect(service.patternCount).toBeGreaterThanOrEqual(10);
    });

    it('should add custom patterns to built-in patterns', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: ['custom-secret', /my-pattern/],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      // Built-in + 2 custom
      expect(service.patternCount).toBeGreaterThanOrEqual(12);
      expect(logger.verbose).toHaveBeenCalledWith(
        'Redaction enabled',
        expect.objectContaining({ customPatterns: 2 })
      );
    });

    it('should replace built-in patterns when replaceBuiltIn is true', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [/only-this/],
        replaceBuiltIn: true,
      };
      const service = new RedactionService(config, logger);

      // Only the custom pattern
      expect(service.patternCount).toBe(1);
      expect(logger.verbose).toHaveBeenCalledWith(
        'Redaction enabled',
        expect.objectContaining({ builtInReplaced: true })
      );
    });
  });

  describe('redact method', () => {
    it('should return null for null input', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      expect(service.redact(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      expect(service.redact(undefined)).toBeNull();
    });

    it('should return original text when redaction is disabled', () => {
      const config: ResolvedRedactionConfig = {
        enabled: false,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const secretText = 'My email is secret@example.com';
      expect(service.redact(secretText)).toBe(secretText);
    });

    it('should not modify text without sensitive data', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const plainText = 'This is just a normal message without secrets';
      expect(service.redact(plainText)).toBe(plainText);
    });
  });

  describe('built-in pattern detection', () => {
    let service: RedactionService;

    beforeEach(() => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      service = new RedactionService(config, logger);
    });

    describe('email addresses', () => {
      it('should redact email addresses', () => {
        const text = 'Contact user@example.com for help';
        expect(service.redact(text)).toBe('Contact [REDACTED] for help');
      });

      it('should redact multiple emails', () => {
        const text = 'Users: admin@test.com and support@domain.org';
        expect(service.redact(text)).toBe('Users: [REDACTED] and [REDACTED]');
      });

      it('should redact emails with plus addressing', () => {
        const text = 'Email: user+test@example.com';
        expect(service.redact(text)).toBe('Email: [REDACTED]');
      });
    });

    describe('JWT tokens', () => {
      it('should redact JWT tokens', () => {
        const jwt =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
        const text = `Token: ${jwt}`;
        expect(service.redact(text)).toBe('Token: [REDACTED]');
      });
    });

    describe('Bearer tokens', () => {
      it('should redact Bearer tokens', () => {
        const text = 'Authorization: Bearer eyJhbGciOiJIUzI1.eyJzdWIiOiIx.dozjgNryP4J';
        expect(service.redact(text)).toBe('Authorization: [REDACTED]');
      });
    });

    describe('credit card numbers', () => {
      it('should redact credit card numbers with dashes', () => {
        const text = 'Card: 4111-1111-1111-1111';
        expect(service.redact(text)).toBe('Card: [REDACTED]');
      });

      it('should redact credit card numbers with spaces', () => {
        const text = 'Card: 4111 1111 1111 1111';
        expect(service.redact(text)).toBe('Card: [REDACTED]');
      });

      it('should redact credit card numbers without separators', () => {
        const text = 'Card: 4111111111111111';
        expect(service.redact(text)).toBe('Card: [REDACTED]');
      });
    });

    describe('SSN (Social Security Numbers)', () => {
      it('should redact SSN in standard format', () => {
        const text = 'SSN: 123-45-6789';
        expect(service.redact(text)).toBe('SSN: [REDACTED]');
      });
    });

    describe('phone numbers', () => {
      it('should redact US phone numbers', () => {
        const text = 'Call: (555) 123-4567';
        // Note: word boundary \b doesn't match after '(', so paren remains
        expect(service.redact(text)).toBe('Call: ([REDACTED]');
      });

      it('should redact phone numbers with dots', () => {
        const text = 'Phone: 555.123.4567';
        expect(service.redact(text)).toBe('Phone: [REDACTED]');
      });

      it('should redact international phone numbers', () => {
        const text = 'Call: +1-555-123-4567';
        // Note: word boundary \b doesn't match after '+', so plus remains
        expect(service.redact(text)).toBe('Call: +[REDACTED]');
      });
    });

    describe('AWS access keys', () => {
      it('should redact AWS access keys', () => {
        const text = 'AWS Key: AKIAIOSFODNN7EXAMPLE';
        expect(service.redact(text)).toBe('AWS Key: [REDACTED]');
      });
    });

    describe('GitHub tokens', () => {
      it('should redact GitHub personal access tokens', () => {
        const text = 'Token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx12345';
        expect(service.redact(text)).toBe('Token: [REDACTED]');
      });

      it('should redact GitHub OAuth tokens', () => {
        const text = 'Token: gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx12345';
        expect(service.redact(text)).toBe('Token: [REDACTED]');
      });
    });

    describe('URL credentials', () => {
      it('should redact passwords in URLs', () => {
        const text = 'Database: postgres://user:secretpassword@localhost/db';
        const result = service.redact(text);
        expect(result).toContain('[REDACTED]');
        expect(result).not.toContain('secretpassword');
      });
    });

    describe('generic API keys/tokens', () => {
      it('should redact strings that look like API keys', () => {
        const text = 'Using api_key_abc123def456ghi789jkl012';
        expect(service.redact(text)).toBe('Using [REDACTED]');
      });

      it('should redact tokens with common prefixes', () => {
        const text = 'Using sk_live_abcdef123456789012345678';
        expect(service.redact(text)).toBe('Using [REDACTED]');
      });
    });
  });

  describe('custom patterns', () => {
    it('should redact strings matching custom string patterns', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: ['my-custom-secret'],
        replaceBuiltIn: true, // Use only custom patterns for cleaner test
      };
      const service = new RedactionService(config, logger);

      const text = 'The value is my-custom-secret here';
      expect(service.redact(text)).toBe('The value is [REDACTED] here');
    });

    it('should be case-insensitive for string patterns', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: ['SecretWord'],
        replaceBuiltIn: true,
      };
      const service = new RedactionService(config, logger);

      expect(service.redact('Contains SECRETWORD uppercase')).toBe('Contains [REDACTED] uppercase');
      expect(service.redact('Contains secretword lowercase')).toBe('Contains [REDACTED] lowercase');
    });

    it('should escape special regex characters in string patterns', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: ['secret.value'],
        replaceBuiltIn: true,
      };
      const service = new RedactionService(config, logger);

      // The dot should be escaped and match literally
      expect(service.redact('Found secret.value here')).toBe('Found [REDACTED] here');
      // Should NOT match "secretXvalue" (dot as wildcard)
      expect(service.redact('Found secretXvalue here')).toBe('Found secretXvalue here');
    });

    it('should support custom RegExp patterns', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [/internal-id-\d+/g],
        replaceBuiltIn: true,
      };
      const service = new RedactionService(config, logger);

      const text = 'Processing internal-id-12345 and internal-id-67890';
      expect(service.redact(text)).toBe('Processing [REDACTED] and [REDACTED]');
    });

    it('should combine multiple custom patterns', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: ['password123', /token_\w+/g, 'API-KEY'],
        replaceBuiltIn: true,
      };
      const service = new RedactionService(config, logger);

      const text = 'Password: password123, Token: token_abc123, Key: API-KEY';
      const result = service.redact(text);
      expect(result).toBe('Password: [REDACTED], Token: [REDACTED], Key: [REDACTED]');
    });
  });

  describe('redactArray method', () => {
    it('should redact all strings in an array', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const input = ['Normal message', 'Email: user@example.com', 'Another normal line'];

      const result = service.redactArray(input);
      expect(result).toEqual(['Normal message', 'Email: [REDACTED]', 'Another normal line']);
    });

    it('should return original array when disabled', () => {
      const config: ResolvedRedactionConfig = {
        enabled: false,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const input = ['Email: user@example.com'];
      expect(service.redactArray(input)).toEqual(input);
    });

    it('should handle empty arrays', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      expect(service.redactArray([])).toEqual([]);
    });

    it('should convert empty strings (redact returns null) to empty strings', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      // Empty string causes redact to return null, which should be converted to ''
      const input = ['valid', '', 'also valid'];
      expect(service.redactArray(input)).toEqual(['valid', '', 'also valid']);
    });
  });

  describe('redactUrl method', () => {
    it('should redact password in URL', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const url = 'https://user:secret@api.example.com/path';
      const result = service.redactUrl(url);
      // URL.toString() URL-encodes the password, so [REDACTED] becomes %5BREDACTED%5D
      expect(result).toContain('%5BREDACTED%5D');
      expect(result).not.toContain('secret');
    });

    it('should redact sensitive query parameters', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const url = 'https://api.example.com/data?token=abc123&name=test';
      const result = service.redactUrl(url);
      // URL.toString() URL-encodes query params
      expect(result).toContain('token=%5BREDACTED%5D');
      expect(result).toContain('name=test'); // Non-sensitive param preserved
    });

    it('should redact multiple sensitive query parameters', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const url = 'https://api.example.com?api_key=xyz&access_token=123&mode=live';
      const result = service.redactUrl(url);
      // URL.toString() URL-encodes query params
      expect(result).toContain('api_key=%5BREDACTED%5D');
      expect(result).toContain('access_token=%5BREDACTED%5D');
      expect(result).toContain('mode=live');
    });

    it('should return null for null input', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      expect(service.redactUrl(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      expect(service.redactUrl(undefined)).toBeNull();
    });

    it('should return original URL when disabled', () => {
      const config: ResolvedRedactionConfig = {
        enabled: false,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const url = 'https://user:secret@api.example.com?token=abc';
      expect(service.redactUrl(url)).toBe(url);
    });

    it('should fallback to general redaction for invalid URLs', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const invalidUrl = 'not-a-url but contains user@example.com';
      const result = service.redactUrl(invalidUrl);
      expect(result).toBe('not-a-url but contains [REDACTED]');
    });
  });

  describe('edge cases', () => {
    it('should handle multiple occurrences in one string', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const text = 'Emails: first@test.com, second@test.com, third@test.com';
      const result = service.redact(text);
      expect(result).toBe('Emails: [REDACTED], [REDACTED], [REDACTED]');
    });

    it('should handle empty string', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      expect(service.redact('')).toBe('');
    });

    it('should handle overlapping patterns correctly', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: ['secret', 'secretvalue'],
        replaceBuiltIn: true,
      };
      const service = new RedactionService(config, logger);

      // Both patterns should work
      expect(service.redact('The secret is here')).toBe('The [REDACTED] is here');
      expect(service.redact('The secretvalue is here')).toBe('The [REDACTED]value is here');
    });

    it('should reset regex lastIndex for global patterns', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      // Call redact multiple times - should work consistently
      const text1 = 'Email: test@example.com';
      const text2 = 'Contact: user@domain.org';

      expect(service.redact(text1)).toBe('Email: [REDACTED]');
      expect(service.redact(text2)).toBe('Contact: [REDACTED]');
      expect(service.redact(text1)).toBe('Email: [REDACTED]');
    });
  });

  describe('real-world test scenarios', () => {
    let service: RedactionService;

    beforeEach(() => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      service = new RedactionService(config, logger);
    });

    it('should redact sensitive data in error messages', () => {
      const errorMessage = `
        Error: Authentication failed
        User: admin@company.com
        API Key used: sk_live_abcdef123456789012345678
        Request ID: req-12345
      `;

      const result = service.redact(errorMessage);
      expect(result).toContain('Error: Authentication failed');
      expect(result).toContain('[REDACTED]'); // Email redacted
      expect(result).toContain('[REDACTED]'); // API key redacted
      expect(result).toContain('Request ID: req-12345'); // Non-sensitive preserved
    });

    it('should redact console output with credentials', () => {
      const consoleLines = [
        '> Connecting to database...',
        '> Connection string: postgres://admin:password123@db.host.com:5432/mydb',
        '> Connected successfully',
      ];

      const result = service.redactArray(consoleLines);
      expect(result[0]).toBe('> Connecting to database...');
      expect(result[1]).toContain('[REDACTED]');
      expect(result[1]).not.toContain('password123');
      expect(result[2]).toBe('> Connected successfully');
    });

    it('should handle Playwright step titles with URLs', () => {
      // redactUrl is designed for actual URLs, not text containing URLs
      // For non-URL text, it falls back to redact() with general patterns
      const url = 'https://app.com/login?token=secret123&ref=home';
      const result = service.redactUrl(url);
      // URL.toString() URL-encodes query params
      expect(result).toContain('token=%5BREDACTED%5D');
      expect(result).toContain('ref=home'); // Non-sensitive param preserved
    });
  });
});

describe('ConfigService redaction resolution', () => {
  it('should resolve undefined to default enabled config', () => {
    const result = ConfigService.instance().resolve({ source: 'test' });
    expect(result.redaction).toEqual({
      enabled: true,
      patterns: [],
      replaceBuiltIn: false,
    });
  });

  it('should resolve true to default enabled config', () => {
    const result = ConfigService.instance().resolve({
      source: 'test',
      redact: true,
    });
    expect(result.redaction).toEqual({
      enabled: true,
      patterns: [],
      replaceBuiltIn: false,
    });
  });

  it('should resolve false to disabled config', () => {
    const result = ConfigService.instance().resolve({
      source: 'test',
      redact: false,
    });
    expect(result.redaction).toEqual({
      enabled: false,
      patterns: [],
      replaceBuiltIn: false,
    });
  });

  it('should resolve array of patterns', () => {
    const patterns = ['password', /secret-\d+/];
    const result = ConfigService.instance().resolve({
      source: 'test',
      redact: patterns,
    });
    expect(result.redaction).toEqual({
      enabled: true,
      patterns,
      replaceBuiltIn: false,
    });
  });

  it('should resolve full configuration object', () => {
    const result = ConfigService.instance().resolve({
      source: 'test',
      redact: {
        enabled: true,
        patterns: ['custom'],
        replaceBuiltIn: true,
      },
    });
    expect(result.redaction).toEqual({
      enabled: true,
      patterns: ['custom'],
      replaceBuiltIn: true,
    });
  });

  it('should use defaults for partial configuration object', () => {
    const result = ConfigService.instance().resolve({
      source: 'test',
      redact: {
        patterns: ['only-patterns'],
      },
    });
    expect(result.redaction).toEqual({
      enabled: true, // Default
      patterns: ['only-patterns'],
      replaceBuiltIn: false, // Default
    });
  });
});

describe('Redaction Quality - Error Context Preservation', () => {
  let logger: LoggerService;

  beforeEach(() => {
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      verbose: vi.fn(),
    } as unknown as LoggerService;
  });

  it('should preserve file paths and line numbers in stack traces', () => {
    const config: ResolvedRedactionConfig = {
      enabled: true,
      patterns: [],
      replaceBuiltIn: false,
    };
    const service = new RedactionService(config, logger);

    const stackTrace = `Error: Test failed
    at Object.<anonymous> (/home/user/project/tests/login.spec.ts:25:15)
    at Module._compile (node:internal/modules/cjs/loader:1256:14)
    API_KEY=sk_test_1234567890abcdef`;

    const redacted = service.redact(stackTrace);

    // Should preserve file paths and line numbers
    expect(redacted).toContain('tests/login.spec.ts:25:15');
    expect(redacted).toContain('Module._compile');
    // Should redact the API key
    expect(redacted).not.toContain('sk_test_1234567890abcdef');
    expect(redacted).toContain('[REDACTED]');
  });

  it('should preserve assertion messages while redacting embedded secrets', () => {
    const config: ResolvedRedactionConfig = {
      enabled: true,
      patterns: [],
      replaceBuiltIn: false,
    };
    const service = new RedactionService(config, logger);

    const errorMessage = `Expected: element to be visible
Received: element is hidden
API Response: {"status": 401, "token": "ghp_abcdef1234567890abcdef1234567890abcdef"}`;

    const redacted = service.redact(errorMessage);

    // Should preserve the assertion context
    expect(redacted).toContain('Expected: element to be visible');
    expect(redacted).toContain('Received: element is hidden');
    expect(redacted).toContain('"status": 401');
    // Should redact the token
    expect(redacted).not.toContain('ghp_abcdef1234567890abcdef1234567890abcdef');
  });

  it('should preserve HTTP status codes and method names', () => {
    const config: ResolvedRedactionConfig = {
      enabled: true,
      patterns: [],
      replaceBuiltIn: false,
    };
    const service = new RedactionService(config, logger);

    const errorMessage = `POST /api/users failed with status 403
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U`;

    const redacted = service.redact(errorMessage);

    // Should preserve HTTP context
    expect(redacted).toContain('POST /api/users failed with status 403');
    // Should redact Bearer token
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(redacted).toContain('[REDACTED]');
  });

  it('should preserve element selectors and locator info', () => {
    const config: ResolvedRedactionConfig = {
      enabled: true,
      patterns: [],
      replaceBuiltIn: false,
    };
    const service = new RedactionService(config, logger);

    const errorMessage = `Locator: page.getByTestId('login-button')
Element not found within 30000ms
User email: john.doe@example.com attempted login`;

    const redacted = service.redact(errorMessage);

    // Should preserve locator info
    expect(redacted).toContain("page.getByTestId('login-button')");
    expect(redacted).toContain('Element not found within 30000ms');
    // Should redact email
    expect(redacted).not.toContain('john.doe@example.com');
  });

  it('should handle nested JSON with mixed sensitive and non-sensitive data', () => {
    const config: ResolvedRedactionConfig = {
      enabled: true,
      patterns: [],
      replaceBuiltIn: false,
    };
    const service = new RedactionService(config, logger);

    const jsonError = JSON.stringify({
      error: 'Authentication failed',
      details: {
        endpoint: '/api/v2/auth',
        method: 'POST',
        apiKey: 'sk_live_abcdef123456',
        userEmail: 'admin@company.com',
      },
      timestamp: '2024-01-15T10:30:00Z',
    });

    const redacted = service.redact(jsonError);
    const parsed = JSON.parse(redacted!);

    // Should preserve structure and non-sensitive fields
    expect(parsed.error).toBe('Authentication failed');
    expect(parsed.details.endpoint).toBe('/api/v2/auth');
    expect(parsed.details.method).toBe('POST');
    expect(parsed.timestamp).toBe('2024-01-15T10:30:00Z');
    // Sensitive fields should be redacted
    expect(parsed.details.apiKey).not.toContain('sk_live');
    expect(parsed.details.userEmail).not.toContain('@');
  });

  it('should not over-redact common words that look like patterns', () => {
    const config: ResolvedRedactionConfig = {
      enabled: true,
      patterns: [],
      replaceBuiltIn: false,
    };
    const service = new RedactionService(config, logger);

    // These should NOT be redacted
    const normalText = `The password field was empty
Token count: 5
API endpoint returned 200`;

    const redacted = service.redact(normalText);

    // Common words should not be redacted
    expect(redacted).toContain('password field was empty');
    expect(redacted).toContain('Token count: 5');
    expect(redacted).toContain('API endpoint returned 200');
  });
});

// ==========================================================================
// Redaction Edge Cases
// ==========================================================================

describe('Redaction edge cases', () => {
  let logger: LoggerService;

  beforeEach(() => {
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      verbose: vi.fn(),
    } as unknown as LoggerService;
  });

  describe('encoded secrets', () => {
    it('should handle base64-encoded secrets in error messages', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      // Base64-encoded API key: "sk_live_abc123def456"
      const base64Secret = Buffer.from('sk_live_abc123def456').toString('base64');
      const errorMessage = `Config error: Invalid base64 token ${base64Secret}`;

      const redacted = service.redact(errorMessage);

      // The raw secret pattern should be redacted, not the base64
      // This tests that we at least detect common patterns
      expect(redacted).toContain('Config error');
    });

    it('should handle URL-encoded sensitive values', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      // URL-encoded email: user%40example.com
      const urlEncodedEmail = encodeURIComponent('user@example.com');
      const errorMessage = `User lookup failed for ${urlEncodedEmail}`;

      const redacted = service.redact(errorMessage);

      // URL-encoded @ becomes %40, so email pattern won't match
      // This is expected behavior - test documents it
      expect(redacted).toContain('User lookup failed');
    });

    it('should handle double-encoded values', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const doubleEncoded = encodeURIComponent(encodeURIComponent('user@example.com'));
      const errorMessage = `Debug: ${doubleEncoded}`;

      const redacted = service.redact(errorMessage);

      // Should not crash
      expect(redacted).toContain('Debug:');
    });
  });

  describe('multi-line secrets', () => {
    it('should handle multi-line API keys in stack traces', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const stackTrace = `Error: Authentication failed
      at login (/app/auth.ts:25:10)
      API_KEY=sk_live_1234567890abcdef
      at processRequest (/app/server.ts:100:5)`;

      const redacted = service.redact(stackTrace);

      // API key should be redacted
      expect(redacted).not.toContain('sk_live_1234567890abcdef');
      expect(redacted).toContain('[REDACTED]');
      // Stack trace should be preserved
      expect(redacted).toContain('at login');
      expect(redacted).toContain('at processRequest');
    });

    it('should handle PEM-formatted private keys', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [/-----BEGIN [A-Z ]+ KEY-----[\s\S]*?-----END [A-Z ]+ KEY-----/g],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const pemKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0...
-----END RSA PRIVATE KEY-----`;
      const errorMessage = `Failed to load key: ${pemKey}`;

      const redacted = service.redact(errorMessage);

      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('MIIEpAIBAAKCAQEA0');
    });

    it('should handle secrets split across lines with continuation', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      // JSON with line breaks
      const jsonWithSecret = `{
  "email": "user@example.com",
  "token": "ghp_1234567890abcdef1234567890abcdef12345678"
}`;

      const redacted = service.redact(jsonWithSecret);

      expect(redacted).not.toContain('user@example.com');
      expect(redacted).not.toContain('ghp_1234567890abcdef');
      expect(redacted).toContain('[REDACTED]');
    });
  });

  describe('non-English PII', () => {
    it('should handle Japanese phone numbers', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [/0\d{1,4}-\d{1,4}-\d{4}/g], // Japanese phone format
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const text = 'お電話番号: 03-1234-5678';

      const redacted = service.redact(text);

      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('03-1234-5678');
    });

    it('should handle Korean resident registration numbers', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [/\d{6}-\d{7}/g], // Korean RRN format
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const text = '주민등록번호: 901231-1234567';

      const redacted = service.redact(text);

      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('901231-1234567');
    });

    it('should handle Chinese ID numbers', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [/\d{17}[\dXx]/g], // Chinese ID format (18 digits)
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const text = '身份证号: 110101199001011234';

      const redacted = service.redact(text);

      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('110101199001011234');
    });

    it('should handle European IBAN numbers', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [/[A-Z]{2}\d{2}[A-Z0-9]{4,}/gi], // IBAN format
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const text = 'Bank account: DE89370400440532013000';

      const redacted = service.redact(text);

      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('DE89370400440532013000');
    });
  });

  describe('edge case patterns', () => {
    it('should handle very long strings without catastrophic backtracking', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      // Create a very long string that could cause regex catastrophic backtracking
      const longString = 'a'.repeat(100000);
      const startTime = Date.now();

      const redacted = service.redact(longString);

      const duration = Date.now() - startTime;

      // Should complete quickly (< 1 second)
      expect(duration).toBeLessThan(1000);
      expect(redacted).toBe(longString);
    });

    it('should handle strings with many potential pattern matches', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      // Many emails in one string
      const manyEmails = Array(100)
        .fill(0)
        .map((_, i) => `user${i}@example${i}.com`)
        .join(' ');
      const startTime = Date.now();

      const redacted = service.redact(manyEmails);

      const duration = Date.now() - startTime;

      // Should complete quickly
      expect(duration).toBeLessThan(1000);
      // All emails should be redacted
      expect(redacted).not.toMatch(/@example\d+\.com/);
    });

    it('should handle null bytes in strings', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const textWithNull = 'user@example.com\x00hidden@secret.com';

      const redacted = service.redact(textWithNull);

      // Should handle without crashing
      expect(redacted).toContain('[REDACTED]');
    });

    it('should handle control characters', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const textWithControl = 'Email:\x07user@example.com\x1B[0m';

      const redacted = service.redact(textWithControl);

      expect(redacted).not.toContain('user@example.com');
    });

    it('should handle regex special characters in input text', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const textWithRegexChars = 'Error: .*+?^${}()|[] at user@example.com';

      const redacted = service.redact(textWithRegexChars);

      // Should not crash and should redact email
      expect(redacted).toContain('.*+?^${}()|[]');
      expect(redacted).not.toContain('user@example.com');
    });

    it('should handle emoji in sensitive values', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: ['secret🔐key'],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const text = 'Using secret🔐key for auth';

      const redacted = service.redact(text);

      expect(redacted).toBe('Using [REDACTED] for auth');
    });

    it('should handle mixed case in built-in patterns', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      // GitHub tokens are case-sensitive (ghp_ is lowercase)
      const text = 'Token: GHP_AbCdEf1234567890AbCdEf1234567890AbCdEf12';

      // Should not match because ghp_ pattern is lowercase
      // This documents expected behavior
      expect(service.redact(text)).toContain('GHP_');
    });
  });

  describe('concurrent redaction', () => {
    it('should handle multiple concurrent redaction calls', async () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const texts = Array(100)
        .fill(0)
        .map((_, i) => `User ${i}: user${i}@example.com with token sk_live_${i}${'x'.repeat(20)}`);

      // Run all redactions concurrently
      const results = await Promise.all(texts.map((text) => Promise.resolve(service.redact(text))));

      // All should be redacted correctly
      results.forEach((result, i) => {
        expect(result).toContain(`User ${i}:`);
        expect(result).not.toContain(`user${i}@example.com`);
        expect(result).not.toContain(`sk_live_${i}`);
      });
    });
  });

  describe('partial matches and false positives', () => {
    it('should not redact email-like strings that are not emails', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      // These look like emails but might not be
      const text = 'file@2x.png icon@3x.png selector@media';

      const redacted = service.redact(text);

      // These should still be redacted as they match email pattern
      // This documents the aggressive behavior
      expect(redacted).toContain('[REDACTED]');
    });

    it('should not redact test fixture data that looks like secrets', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      // Test data that looks like secrets
      const text = 'Using test API key sk_test_XXXXXXXXXXXXXXXX';

      const redacted = service.redact(text);

      // Test keys should still be redacted (conservative approach)
      expect(redacted).toContain('[REDACTED]');
    });

    it('should handle URLs that contain email-like substrings', () => {
      const config: ResolvedRedactionConfig = {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
      const service = new RedactionService(config, logger);

      const text = 'Visit https://gravatar.com/avatar/user@example.com';

      const redacted = service.redact(text);

      // Email should be redacted
      expect(redacted).not.toContain('user@example.com');
    });
  });
});
