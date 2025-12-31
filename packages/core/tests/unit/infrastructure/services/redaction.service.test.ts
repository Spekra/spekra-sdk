import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedactionService } from '../../../../src/infrastructure/services/redaction.service';
import { LoggerService } from '../../../../src/infrastructure/services/logger.service';
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

    it('should preserve file paths and line numbers in stack traces', () => {
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

    it('should preserve HTTP status codes and method names', () => {
      const errorMessage = `POST /api/users failed with status 403
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U`;

      const redacted = service.redact(errorMessage);

      // Should preserve HTTP context
      expect(redacted).toContain('POST /api/users failed with status 403');
      // Should redact Bearer token
      expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(redacted).toContain('[REDACTED]');
    });
  });
});

