/**
 * Infrastructure clients
 */

export {
  BaseClient,
  type ClientConfig,
  type ClientResult,
  type ClientError,
} from './base.client';

export {
  ApiClient,
  type ApiClientConfig,
  type SendReportResult,
  type ConfirmUploadsPayload,
  type ConfirmUploadsResponse,
  type ConfirmUploadsResult,
} from './api.client';

