export { runValidateCommand } from './commands/validate-command';
export { runUploadCommand } from './commands/upload-command';
export { parseJUnitXml } from './lib/junit-parser';
export { loadAndNormalizeResults, parseJunitPathsOption } from './lib/report-loader';
export { resolveUploadMetadata, getReporterVersion } from './lib/metadata';
export { uploadResults } from './lib/uploader';
export type {
  ValidationSummary,
  ParsedJUnitReport,
  LoadedResults,
  ValidateCommandOptions,
  UploadCommandOptions,
  UploadMetadata,
  UploadApiSummary,
  UploadApiResponse,
} from './types';
