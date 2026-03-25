import type { UploadCommandOptions } from '../types';
import { resolveUploadMetadata } from '../lib/metadata';
import { logInfo, logSuccess, logValidationSummary } from '../lib/output';
import { loadAndNormalizeResults } from '../lib/report-loader';
import { uploadResults } from '../lib/uploader';

export async function runUploadCommand(options: UploadCommandOptions): Promise<number> {
  const { files, results, warnings, summary, runTiming } = await loadAndNormalizeResults(options.junitPaths);
  logValidationSummary(files.length, summary, warnings);

  if (results.length === 0) {
    throw new Error('No testcases found to upload.');
  }

  const metadata = await resolveUploadMetadata(options);
  const uploadResult = await uploadResults(metadata, results, runTiming);

  logSuccess(`Upload successful: runId=${metadata.runId} testsSent=${results.length} requestId=${uploadResult.requestId}`);

  if (uploadResult.responseBody?.summary) {
    const apiSummary = uploadResult.responseBody.summary;
    logInfo(
      `API summary: received=${apiSummary.testsReceived} passed=${apiSummary.passed} failed=${apiSummary.failed} skipped=${apiSummary.skipped}`
    );
  }

  return 0;
}
