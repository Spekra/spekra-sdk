import { randomUUID } from 'node:crypto';
import type { TestResult } from '@spekra/core';
import type { RunTiming, UploadApiResponse, UploadMetadata, UploadPayload } from '../types';
import { getReporterVersion } from './metadata';

interface UploadResult {
  requestId: string;
  responseBody: UploadApiResponse | null;
}

function resolveIsoMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function resolveRunWindow(timing?: RunTiming): { startedAt: string; finishedAt: string } {
  const nowMs = Date.now();

  const startMs = resolveIsoMs(timing?.startedAt ?? null);
  const finishMs = resolveIsoMs(timing?.finishedAt ?? null);
  const durationMs = timing?.durationMs ?? null;

  if (startMs !== null && finishMs !== null && finishMs >= startMs) {
    return {
      startedAt: new Date(startMs).toISOString(),
      finishedAt: new Date(finishMs).toISOString(),
    };
  }

  if (startMs !== null && durationMs !== null && durationMs >= 0) {
    return {
      startedAt: new Date(startMs).toISOString(),
      finishedAt: new Date(startMs + durationMs).toISOString(),
    };
  }

  if (finishMs !== null && durationMs !== null && durationMs >= 0) {
    return {
      startedAt: new Date(Math.max(0, finishMs - durationMs)).toISOString(),
      finishedAt: new Date(finishMs).toISOString(),
    };
  }

  if (durationMs !== null && durationMs > 0) {
    return {
      startedAt: new Date(nowMs - durationMs).toISOString(),
      finishedAt: new Date(nowMs).toISOString(),
    };
  }

  return {
    startedAt: new Date(nowMs).toISOString(),
    finishedAt: new Date(nowMs).toISOString(),
  };
}

function buildUploadPayload(metadata: UploadMetadata, results: TestResult[], timing?: RunTiming): UploadPayload {
  const runWindow = resolveRunWindow(timing);

  return {
    runId: metadata.runId,
    source: metadata.source,
    framework: metadata.framework,
    branch: metadata.branch,
    commitSha: metadata.commitSha,
    ciUrl: metadata.ciUrl,
    shardIndex: null,
    totalShards: null,
    startedAt: runWindow.startedAt,
    finishedAt: runWindow.finishedAt,
    results,
  };
}

function getErrorDetail(status: number, responseText: string, responseBody: UploadApiResponse | null): string {
  return (
    responseBody?.error ??
    responseBody?.message ??
    responseText ??
    `HTTP ${status}`
  );
}

export async function uploadResults(
  metadata: UploadMetadata,
  results: TestResult[],
  timing?: RunTiming
): Promise<UploadResult> {
  const payload = buildUploadPayload(metadata, results, timing);
  const requestId = randomUUID();

  let response: Response;
  try {
    response = await fetch(metadata.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': metadata.apiKey,
        'x-reporter-version': getReporterVersion(),
        'x-request-id': requestId,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Upload request failed: ${detail} (url=${metadata.apiUrl})`);
  }

  const responseText = await response.text();
  let responseBody: UploadApiResponse | null = null;
  try {
    responseBody = JSON.parse(responseText) as UploadApiResponse;
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    throw new Error(`Upload failed (${response.status}): ${getErrorDetail(response.status, responseText, responseBody)}`);
  }

  return {
    requestId,
    responseBody,
  };
}
