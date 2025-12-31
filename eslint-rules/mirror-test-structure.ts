/**
 * ESLint Rule: mirror-test-structure
 *
 * Enforces that unit test files mirror the source code directory structure.
 *
 * Example:
 *   src/infrastructure/services/ci.service.ts
 *   → tests/unit/infrastructure/services/ci.service.test.ts
 *
 * Also enforces that tests only import:
 * - The file they're testing (derived from path)
 * - Test utilities (vitest, mocks)
 * - Type-only imports
 * - Domain entities (value objects are safe to use directly)
 */

import type { Rule } from 'eslint';
import * as path from 'path';
import * as fs from 'fs';

// Files that don't require corresponding test files
const EXCLUDED_SOURCE_FILES = ['index.ts', 'types.ts'];

// Allowed import patterns that aren't the file under test
const ALLOWED_IMPORT_PATTERNS = [
  /^vitest$/,
  /^@vitest\//,
  /^node:/,
  /^fs$/,
  /^path$/,
  /^os$/,
  /^crypto$/,
  /^@playwright\/test/,
  /^@spekra\//, // Allow imports from other spekra packages
];

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that unit test files mirror the source directory structure and only import their target file',
      recommended: true,
    },
    messages: {
      wrongLocation:
        'Test file is in wrong location. Expected: "{{expected}}" to test "{{source}}"',
      noMatchingSource:
        'Test file "{{testFile}}" does not have a matching source file. Expected source at "{{expectedSource}}"',
      invalidImport:
        'Test file should only import from its target source file "{{expectedSource}}", not "{{actualImport}}". Use type-only imports for other dependencies.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          testDir: {
            type: 'string',
            default: 'tests/unit',
          },
          srcDir: {
            type: 'string',
            default: 'src',
          },
          excludedFiles: {
            type: 'array',
            items: { type: 'string' },
            default: ['index.ts', 'types.ts'],
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const testDir = options.testDir || 'tests/unit';
    const srcDir = options.srcDir || 'src';
    const excludedFiles = options.excludedFiles || EXCLUDED_SOURCE_FILES;

    const filename = context.filename || context.getFilename();

    // Only apply to unit test files
    if (!filename.includes(`/${testDir}/`) || !filename.endsWith('.test.ts')) {
      return {};
    }

    // Extract the relative path from tests/unit/
    const testDirIndex = filename.indexOf(`/${testDir}/`);
    if (testDirIndex === -1) return {};

    const packageRoot = filename.substring(0, testDirIndex);
    const relativeTestPath = filename.substring(testDirIndex + testDir.length + 2); // +2 for slashes

    // Convert test path to expected source path
    // infrastructure/services/ci.service.test.ts → infrastructure/services/ci.service.ts
    const expectedSourceRelative = relativeTestPath.replace('.test.ts', '.ts');
    const expectedSourcePath = path.join(packageRoot, srcDir, expectedSourceRelative);
    const expectedSourcePathNormalized = expectedSourcePath.replace(/\\/g, '/');

    // Check if the source file exists
    const sourceExists = fs.existsSync(expectedSourcePath);
    const sourceBasename = path.basename(expectedSourceRelative);

    // If source doesn't exist and it's not an excluded file, report error
    if (!sourceExists && !excludedFiles.includes(sourceBasename)) {
      context.report({
        loc: { line: 1, column: 0 },
        messageId: 'noMatchingSource',
        data: {
          testFile: relativeTestPath,
          expectedSource: `${srcDir}/${expectedSourceRelative}`,
        },
      });
    }

    // Calculate the expected import path from the test file to the source file
    const testFileDir = path.dirname(filename);
    const expectedImportPath = path
      .relative(testFileDir, expectedSourcePath)
      .replace(/\\/g, '/')
      .replace('.ts', '');

    return {
      ImportDeclaration(node) {
        const importSource = node.source.value;
        if (typeof importSource !== 'string') return;

        // Allow type-only imports from anywhere
        // importKind is a TypeScript-specific property added by @typescript-eslint/parser
        if ((node as unknown as { importKind?: string })?.importKind === 'type') return;

        // Allow imports that match allowed patterns
        if (ALLOWED_IMPORT_PATTERNS.some((pattern) => pattern.test(importSource))) {
          return;
        }

        // Allow relative imports that go to the source directory
        if (importSource.startsWith('./') || importSource.startsWith('../')) {
          // Resolve the import to an absolute path
          const resolvedImport = path.resolve(testFileDir, importSource);
          const resolvedImportNormalized = resolvedImport.replace(/\\/g, '/');

          // Check if it's importing from the src directory
          if (!resolvedImportNormalized.includes(`/${srcDir}/`)) {
            // Importing from outside src is fine (like test utilities)
            return;
          }

          // It's importing from src - check if it's the correct file
          // Allow the exact file or its directory (for importing from index)
          const expectedSourceDir = path.dirname(expectedSourcePathNormalized);

          // Allow importing the exact source file
          if (
            resolvedImportNormalized === expectedSourcePathNormalized.replace('.ts', '') ||
            resolvedImportNormalized === expectedSourcePathNormalized
          ) {
            return;
          }

          // Allow importing from the same directory (like index.ts barrel imports)
          if (resolvedImportNormalized.startsWith(expectedSourceDir)) {
            return;
          }

          // Allow importing from domain/entities (value objects are safe to use directly)
          if (resolvedImportNormalized.includes('/domain/entities/')) {
            return;
          }

          // Report invalid import
          context.report({
            node,
            messageId: 'invalidImport',
            data: {
              expectedSource: expectedImportPath,
              actualImport: importSource,
            },
          });
        }
      },
    };
  },
};

export default rule;

