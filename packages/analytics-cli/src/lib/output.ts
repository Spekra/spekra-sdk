import chalk from 'chalk';
import type { ValidationSummary } from '../types';

const PREFIX = chalk.cyan('[Spekra]');

export function logInfo(message: string): void {
  console.log(`${PREFIX} ${message}`);
}

export function logSuccess(message: string): void {
  console.log(`${PREFIX} ${chalk.green(message)}`);
}

export function logWarning(message: string): void {
  console.warn(`${PREFIX} ${chalk.yellow(message)}`);
}

export function logError(message: string): void {
  console.error(`${PREFIX} ${chalk.red(message)}`);
}

export function logValidationSummary(
  fileCount: number,
  summary: ValidationSummary,
  warnings: string[]
): void {
  logInfo(`Parsed ${summary.total} testcase(s) from ${fileCount} file(s).`);
  logInfo(
    `Status counts: passed=${summary.passed} failed=${summary.failed} skipped=${summary.skipped}`
  );

  if (warnings.length === 0) {
    logSuccess('Validation passed with no warnings.');
    return;
  }

  logWarning(`Validation warnings (${warnings.length}):`);
  for (const warning of warnings) {
    logWarning(`  - ${warning}`);
  }
}
