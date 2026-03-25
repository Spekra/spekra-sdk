import path from 'node:path';
import type { TestResult } from '@spekra/core';
import type { ParsedJUnitReport } from '../types';

function decodeXmlEntities(input: string): string {
  return input
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function stripTags(input: string): string {
  return decodeXmlEntities(input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseAttributes(fragment: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attrRegex = /([A-Za-z_][^\s=]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(fragment)) !== null) {
    const name = match[1];
    const value = decodeXmlEntities(match[3] ?? match[4] ?? '');
    attributes[name] = value;
  }

  return attributes;
}

function normalizeName(input: string): string {
  return input.toLowerCase().replace(/[\s_.-]+/g, '');
}

function deriveSuitePath(className?: string, suiteName?: string): string[] {
  if (className) {
    if (className.includes(' > ')) {
      return className
        .split(' > ')
        .map((part) => part.trim())
        .filter(Boolean);
    }

    if (className.includes('::')) {
      return className
        .split('::')
        .map((part) => part.trim())
        .filter(Boolean);
    }

    if (!className.includes('/') && className.includes('.')) {
      return className
        .split('.')
        .map((part) => part.trim())
        .filter(Boolean);
    }

    return [className];
  }

  if (suiteName) {
    return [suiteName];
  }

  return [];
}

function extractFailureMessage(innerXml: string): string | null {
  const failureMatch = innerXml.match(/<(failure|error)\b([^>]*)>([\s\S]*?)<\/\1>/i);
  if (!failureMatch) {
    return null;
  }

  const attrs = parseAttributes(failureMatch[2] ?? '');
  if (attrs.message && attrs.message.trim().length > 0) {
    return attrs.message.trim();
  }

  const text = stripTags(failureMatch[3] ?? '').trim();
  if (!text) {
    return null;
  }

  const firstLine = text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ?? text;
}

function inferStatus(innerXml: string): TestResult['status'] {
  if (/<skipped\b/i.test(innerXml)) {
    return 'skipped';
  }

  if (/<failure\b/i.test(innerXml) || /<error\b/i.test(innerXml)) {
    return 'failed';
  }

  return 'passed';
}

function parseDurationMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number.parseFloat(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  return Math.max(0, Math.round(seconds * 1000));
}

function parseTimestampMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    return null;
  }

  return ms;
}

function parseTestCasesFromBlock(blockXml: string, suiteAttrs: Record<string, string>): TestResult[] {
  const results: TestResult[] = [];
  const testcaseRegex = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gi;
  let testcaseMatch: RegExpExecArray | null;

  while ((testcaseMatch = testcaseRegex.exec(blockXml)) !== null) {
    const attrs = parseAttributes(testcaseMatch[1] ?? '');
    const inner = testcaseMatch[2] ?? '';

    const testFile = attrs.file ?? suiteAttrs.file ?? attrs.classname ?? 'unknown';
    const testName = (attrs.name ?? 'unnamed test').trim();
    const suitePath = deriveSuitePath(attrs.classname, suiteAttrs.name);
    const fullTitle = [...suitePath, testName].filter(Boolean).join(' > ') || testName;

    const durationSeconds = Number.parseFloat(attrs.time ?? '0');
    const rawDurationMs = Number.isFinite(durationSeconds) ? durationSeconds * 1000 : 0;
    const durationMs = rawDurationMs > 0 ? Math.max(1, Math.round(rawDurationMs)) : 0;

    const status = inferStatus(inner);
    const errorMessage = status === 'failed' ? extractFailureMessage(inner) : null;

    results.push({
      testFile,
      fullTitle,
      suitePath,
      testName,
      tags: [],
      project: attrs.project ?? null,
      status,
      durationMs,
      retry: 0,
      errorMessage,
    });
  }

  return results;
}

export function parseJUnitXml(xml: string, originPath: string): ParsedJUnitReport {
  const allResults: TestResult[] = [];
  const warnings: string[] = [];
  let suiteCount = 0;

  let earliestSuiteStartMs: number | null = null;
  let latestSuiteEndMs: number | null = null;
  let totalSuiteDurationMs = 0;

  const rootSuitesMatch = xml.match(/<testsuites\b([^>]*)>/i);
  const rootSuitesAttrs = rootSuitesMatch ? parseAttributes(rootSuitesMatch[1] ?? '') : {};
  const rootDurationMs = parseDurationMs(rootSuitesAttrs.time);

  const suiteRegex = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/gi;
  let suiteMatch: RegExpExecArray | null;

  while ((suiteMatch = suiteRegex.exec(xml)) !== null) {
    suiteCount++;
    const suiteAttrs = parseAttributes(suiteMatch[1] ?? '');

    const suiteDurationMs = parseDurationMs(suiteAttrs.time);
    if (suiteDurationMs !== null) {
      totalSuiteDurationMs += suiteDurationMs;
    }

    const suiteStartMs = parseTimestampMs(suiteAttrs.timestamp);
    if (suiteStartMs !== null) {
      earliestSuiteStartMs =
        earliestSuiteStartMs === null ? suiteStartMs : Math.min(earliestSuiteStartMs, suiteStartMs);

      if (suiteDurationMs !== null) {
        const suiteEndMs = suiteStartMs + suiteDurationMs;
        latestSuiteEndMs = latestSuiteEndMs === null ? suiteEndMs : Math.max(latestSuiteEndMs, suiteEndMs);
      }
    }

    const suiteResults = parseTestCasesFromBlock(suiteMatch[2] ?? '', suiteAttrs);
    allResults.push(...suiteResults);
  }

  if (suiteCount === 0) {
    const rootResults = parseTestCasesFromBlock(xml, {});
    allResults.push(...rootResults);
  }

  if (allResults.length === 0) {
    warnings.push(`[${originPath}] No <testcase> entries parsed.`);
  }

  const missingFileCount = allResults.filter((result) => !result.testFile || result.testFile === 'unknown').length;
  if (missingFileCount > 0) {
    warnings.push(
      `[${originPath}] ${missingFileCount} testcase(s) missing explicit file metadata. Consider enabling file attributes in your JUnit reporter.`
    );
  }

  let fileLevelCount = 0;
  for (const result of allResults) {
    const fileBase = path.basename(result.testFile, path.extname(result.testFile));
    if (normalizeName(fileBase) === normalizeName(result.testName)) {
      fileLevelCount++;
    }
  }

  if (fileLevelCount > 0) {
    warnings.push(
      `[${originPath}] ${fileLevelCount} testcase(s) look file-level (name matches filename). This can indicate test runner configuration issues.`
    );
  }

  const fallbackDurationMs =
    rootDurationMs ??
    (totalSuiteDurationMs > 0 ? totalSuiteDurationMs : allResults.reduce((sum, result) => sum + result.durationMs, 0));

  let timing: ParsedJUnitReport['timing'] = {
    startedAt: null,
    finishedAt: null,
    durationMs: fallbackDurationMs > 0 ? fallbackDurationMs : null,
  };

  // Prefer root duration when available; suite timestamps in Vitest can be clustered and under-report.
  if (rootDurationMs !== null) {
    if (earliestSuiteStartMs !== null) {
      timing = {
        startedAt: new Date(earliestSuiteStartMs).toISOString(),
        finishedAt: new Date(earliestSuiteStartMs + rootDurationMs).toISOString(),
        durationMs: rootDurationMs,
      };
    } else {
      timing = {
        startedAt: null,
        finishedAt: null,
        durationMs: rootDurationMs,
      };
    }
  } else if (
    earliestSuiteStartMs !== null &&
    latestSuiteEndMs !== null &&
    latestSuiteEndMs >= earliestSuiteStartMs
  ) {
    timing = {
      startedAt: new Date(earliestSuiteStartMs).toISOString(),
      finishedAt: new Date(latestSuiteEndMs).toISOString(),
      durationMs: latestSuiteEndMs - earliestSuiteStartMs,
    };
  } else if (earliestSuiteStartMs !== null && fallbackDurationMs !== null) {
    timing = {
      startedAt: new Date(earliestSuiteStartMs).toISOString(),
      finishedAt: new Date(earliestSuiteStartMs + fallbackDurationMs).toISOString(),
      durationMs: fallbackDurationMs,
    };
  }

  return {
    results: allResults,
    warnings,
    suiteCount,
    timing,
  };
}
