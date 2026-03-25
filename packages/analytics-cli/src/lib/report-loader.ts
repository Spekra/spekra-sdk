import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { TestResult } from '@spekra/core';
import type { LoadedResults, RunTiming, ValidationSummary } from '../types';
import { resolveJunitFiles } from './file-resolver';
import { parseJUnitXml } from './junit-parser';

export function parseJunitPathsOption(raw: string): string[] {
  if (!raw || raw.trim().length === 0) {
    throw new Error('Missing required option: --junit-paths');
  }

  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function summarizeResults(results: TestResult[]): ValidationSummary {
  const summary: ValidationSummary = {
    total: results.length,
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const result of results) {
    if (result.status === 'passed') {
      summary.passed++;
    } else if (result.status === 'failed') {
      summary.failed++;
    } else if (result.status === 'skipped') {
      summary.skipped++;
    }
  }

  return summary;
}

function toIsoMs(dateString: string | null): number | null {
  if (!dateString) {
    return null;
  }

  const ms = Date.parse(dateString);
  return Number.isFinite(ms) ? ms : null;
}

function deriveRunTiming(fileTimings: RunTiming[]): RunTiming {
  let earliestStartMs: number | null = null;
  let latestFinishedMs: number | null = null;
  let totalDurationMs = 0;

  for (const timing of fileTimings) {
    if (timing.durationMs !== null && timing.durationMs > 0) {
      totalDurationMs += timing.durationMs;
    }

    const startMs = toIsoMs(timing.startedAt);
    if (startMs !== null) {
      earliestStartMs = earliestStartMs === null ? startMs : Math.min(earliestStartMs, startMs);
    }

    const finishMs = toIsoMs(timing.finishedAt);
    if (finishMs !== null) {
      latestFinishedMs = latestFinishedMs === null ? finishMs : Math.max(latestFinishedMs, finishMs);
    }
  }

  if (
    earliestStartMs !== null &&
    latestFinishedMs !== null &&
    latestFinishedMs >= earliestStartMs
  ) {
    return {
      startedAt: new Date(earliestStartMs).toISOString(),
      finishedAt: new Date(latestFinishedMs).toISOString(),
      durationMs: latestFinishedMs - earliestStartMs,
    };
  }

  if (earliestStartMs !== null && totalDurationMs > 0) {
    return {
      startedAt: new Date(earliestStartMs).toISOString(),
      finishedAt: new Date(earliestStartMs + totalDurationMs).toISOString(),
      durationMs: totalDurationMs,
    };
  }

  if (totalDurationMs > 0) {
    const finishedAt = Date.now();
    return {
      startedAt: new Date(finishedAt - totalDurationMs).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: totalDurationMs,
    };
  }

  return {
    startedAt: null,
    finishedAt: null,
    durationMs: null,
  };
}

export async function loadAndNormalizeResults(junitPaths: string): Promise<LoadedResults> {
  const specs = parseJunitPathsOption(junitPaths);
  const files = await resolveJunitFiles(specs);

  if (files.length === 0) {
    throw new Error('No JUnit XML files found for --junit-paths.');
  }

  const allResults: TestResult[] = [];
  const warnings: string[] = [];
  const fileTimings: RunTiming[] = [];

  for (const absolutePath of files) {
    const xml = await fs.readFile(absolutePath, 'utf8');
    const parsed = parseJUnitXml(xml, path.relative(process.cwd(), absolutePath));
    allResults.push(...parsed.results);
    warnings.push(...parsed.warnings);
    fileTimings.push(parsed.timing);
  }

  const summary = summarizeResults(allResults);
  const runTiming = deriveRunTiming(fileTimings);

  return {
    files,
    results: allResults,
    warnings,
    summary,
    runTiming,
  };
}
