/**
 * High-level orchestrator for non-destructive PDF/A archival export.
 *
 * Composes current annotations + Writer V1/V2 content (with subsetted archival
 * fonts), offloads PDF/A remediation + self-audit to the Export Worker when
 * Web Workers are available, and records structured telemetry.
 */

import { log, warn } from '@/core/logger/service';
import {
  createDefaultExportWorkerClient,
  type ExportWorkerClient,
} from '@/core/export/exportWorkerClient';
import { composeArchivalSourcePdf } from './composeArchivalSource';
import { exportPdfA } from './pdfaExporter';
import type {
  ExportPdfAResult,
  PdfARemediationOptions,
} from './types';

export interface ExportCurrentPdfAInput {
  options: PdfARemediationOptions;
  /** Optional explicit bytes for testing or headless invocations. */
  pdfBytes?: Uint8Array;
  fileName?: string;
  signal?: AbortSignal;
  useWorker?: boolean;
  workerClient?: Pick<ExportWorkerClient, 'exportPdfA'>;
}

export async function exportCurrentPdfA(
  input: ExportCurrentPdfAInput,
): Promise<ExportPdfAResult> {
  const startedAt = Date.now();
  const source = input.pdfBytes
    ? { bytes: input.pdfBytes, fileName: input.fileName || 'document.pdf' }
    : await composeArchivalSourcePdf(input.options);

  const workerPayload = {
    pdfBytes: source.bytes,
    options: input.options,
    fileName: source.fileName,
  };

  const shouldUseWorker = input.useWorker ?? typeof Worker !== 'undefined';

  const result = shouldUseWorker
    ? await runExportPdfAViaWorker(workerPayload, input.workerClient, input.signal)
    : await exportPdfA(workerPayload, { signal: input.signal });

  const elapsedMs = Date.now() - startedAt;
  if (result.certificate.passed) {
    log('pdfa', 'Archival PDF/A export verified', {
      conformance: result.certificate.targetConformance,
      pageCount: result.pageCount,
      elapsedMs,
      remediationCount: result.certificate.remediationsApplied.length,
    });
  } else {
    warn('pdfa', 'Archival PDF/A export completed with remaining audit notices', {
      conformance: result.certificate.targetConformance,
      blockers: result.certificate.remainingBlockers.length,
      warnings: result.certificate.remainingWarnings.length,
    });
  }

  return result;
}

async function runExportPdfAViaWorker(
  payload: {
    pdfBytes: Uint8Array;
    options: PdfARemediationOptions;
    fileName?: string;
  },
  injectedClient: Pick<ExportWorkerClient, 'exportPdfA'> | undefined,
  signal?: AbortSignal,
): Promise<ExportPdfAResult> {
  if (injectedClient) {
    return injectedClient.exportPdfA(payload, { signal });
  }

  const client = createDefaultExportWorkerClient();
  try {
    return await client.exportPdfA(payload, { signal });
  } finally {
    client.dispose();
  }
}
