import type { ValidateCommandOptions } from '../types';
import { logValidationSummary } from '../lib/output';
import { loadAndNormalizeResults } from '../lib/report-loader';

export async function runValidateCommand(options: ValidateCommandOptions): Promise<number> {
  const strict = options.strict ?? false;
  const { files, results, warnings, summary } = await loadAndNormalizeResults(options.junitPaths);

  logValidationSummary(files.length, summary, warnings);

  if (results.length === 0) {
    return 1;
  }

  if (strict && warnings.length > 0) {
    return 1;
  }

  return 0;
}
