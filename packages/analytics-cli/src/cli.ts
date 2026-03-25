import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import { runUploadCommand } from './commands/upload-command';
import { runValidateCommand } from './commands/validate-command';
import { logError } from './lib/output';
import type { UploadCommandOptions, ValidateCommandOptions } from './types';

declare const __SDK_VERSION__: string;

interface ValidateCliOptions {
  junitPaths: string;
  strict?: boolean;
}

interface UploadCliOptions {
  junitPaths: string;
  source?: string;
  apiKey?: string;
  apiUrl?: string;
  framework?: string;
  runId?: string;
  branch?: string;
  commitSha?: string;
  ciUrl?: string;
}

function applyExitCode(code: number): void {
  const current = typeof process.exitCode === 'number' ? process.exitCode : 0;
  process.exitCode = Math.max(current, code);
}

function normalizeArgv(argv: string[]): string[] {
  // pnpm forwards a standalone `--` token into scripts; strip it so commander still parses options.
  return argv.filter((arg) => arg !== '--');
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = new Command();

  program
    .name('spekra-analytics')
    .description('Validate and upload JUnit reports to Spekra')
    .version(__SDK_VERSION__)
    .showHelpAfterError()
    .showSuggestionAfterError();

  program
    .command('validate')
    .description('Parse JUnit report(s) and print quality warnings without uploading')
    .requiredOption('--junit-paths <paths>', 'Comma-separated JUnit files, directories, or globs')
    .option('--strict', 'Exit non-zero when warnings are detected')
    .action(async (options: ValidateCliOptions) => {
      const commandOptions: ValidateCommandOptions = {
        junitPaths: options.junitPaths,
        strict: options.strict ?? false,
      };
      const code = await runValidateCommand(commandOptions);
      applyExitCode(code);
    });

  program
    .command('upload')
    .description('Parse JUnit report(s) and upload results to Spekra')
    .requiredOption('--junit-paths <paths>', 'Comma-separated JUnit files, directories, or globs')
    .option('--source <source>', 'Stable source identifier (or SPEKRA_SOURCE)')
    .option('--api-key <apiKey>', 'Spekra API key (or SPEKRA_API_KEY)')
    .option('--api-url <apiUrl>', 'API URL (or SPEKRA_API_URL)')
    .option('--framework <framework>', 'vitest | jest | playwright (or SPEKRA_FRAMEWORK)')
    .option('--run-id <runId>', 'Explicit run ID (or SPEKRA_RUN_ID)')
    .option('--branch <branch>', 'Git branch override')
    .option('--commit-sha <commitSha>', 'Git commit SHA override')
    .option('--ci-url <ciUrl>', 'CI run URL override')
    .action(async (options: UploadCliOptions) => {
      const commandOptions: UploadCommandOptions = {
        junitPaths: options.junitPaths,
        source: options.source,
        apiKey: options.apiKey,
        apiUrl: options.apiUrl,
        framework: options.framework,
        runId: options.runId,
        branch: options.branch,
        commitSha: options.commitSha,
        ciUrl: options.ciUrl,
      };
      const code = await runUploadCommand(commandOptions);
      applyExitCode(code);
    });

  await program.parseAsync(normalizeArgv(argv));
}

runCli().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError(message);
  console.error(chalk.gray('[Spekra] Use --help for command usage.'));
  process.exitCode = 1;
});
