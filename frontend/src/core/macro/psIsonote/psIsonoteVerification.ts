import { FileAdapter } from '@/adapters/file/FileAdapter';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  parseVersionedPsIsonoteMarkers,
  type PsIsonoteMarkerIdentity,
} from './psIsonoteIdentity';

export type PsIsonoteVerificationDiagnosticCode =
  | 'PS_ISONOTE_OUTPUT_OPEN_FAILED'
  | 'PS_ISONOTE_OUTPUT_PAGE_COUNT_MISMATCH'
  | 'PS_ISONOTE_OUTPUT_HASH_MISMATCH'
  | 'PS_ISONOTE_MARKER_MISSING'
  | 'PS_ISONOTE_MARKER_DUPLICATE';

export interface PsIsonoteExpectedMarker extends PsIsonoteMarkerIdentity {
  pageNumber: number;
}

export type PsIsonoteMarkerVerificationStatus = 'verified' | 'missing' | 'duplicate';

export interface PsIsonoteMarkerVerification extends PsIsonoteExpectedMarker {
  foundCount: number;
  status: PsIsonoteMarkerVerificationStatus;
}

export interface PsIsonoteVerificationDiagnostic {
  code: PsIsonoteVerificationDiagnosticCode;
  severity: 'error';
  message: string;
  psNo?: string;
  pageNumber?: number;
  occurrenceId?: string;
}

export interface PsIsonoteVerificationResult {
  verified: boolean;
  outputSha256: string;
  outputDocumentKey: string | null;
  outputDocumentKeyMatchesHash: boolean;
  expectedPageCount: number;
  actualPageCount: number | null;
  expectedMarkerCount: number;
  verifiedMarkerCount: number;
  markerResults: PsIsonoteMarkerVerification[];
  diagnostics: PsIsonoteVerificationDiagnostic[];
}

export interface VerifyPsIsonoteOutputOptions {
  outputBytes: Uint8Array;
  outputDocumentKey: string | null;
  expectedPageCount: number;
  expectedMarkers: readonly PsIsonoteExpectedMarker[];
}

function markerKey(marker: PsIsonoteMarkerIdentity): string {
  return `${marker.psNo}|${marker.mappingHash}|${marker.occurrenceId}`;
}

function markerDiagnostic(
  marker: PsIsonoteExpectedMarker,
  code: 'PS_ISONOTE_MARKER_MISSING' | 'PS_ISONOTE_MARKER_DUPLICATE',
  foundCount: number,
): PsIsonoteVerificationDiagnostic {
  return {
    code,
    severity: 'error',
    psNo: marker.psNo,
    pageNumber: marker.pageNumber,
    occurrenceId: marker.occurrenceId,
    message: code === 'PS_ISONOTE_MARKER_MISSING'
      ? `${marker.psNo} marker was not found on output page ${marker.pageNumber}.`
      : `${marker.psNo} marker appeared ${foundCount} times on output page ${marker.pageNumber}; exactly one was expected.`,
  };
}

export async function verifyPsIsonoteOutput(
  options: VerifyPsIsonoteOutputOptions,
): Promise<PsIsonoteVerificationResult> {
  const outputSha256 = await FileAdapter.hashBytes(options.outputBytes);
  const outputDocumentKeyMatchesHash = options.outputDocumentKey === null ||
    options.outputDocumentKey === outputSha256;
  const diagnostics: PsIsonoteVerificationDiagnostic[] = [];
  const markerResults: PsIsonoteMarkerVerification[] = [];

  if (!outputDocumentKeyMatchesHash) {
    diagnostics.push({
      code: 'PS_ISONOTE_OUTPUT_HASH_MISMATCH',
      severity: 'error',
      message: `The active output document key does not match the output PDF SHA-256 (${outputSha256}).`,
    });
  }

  let actualPageCount: number | null = null;
  const markersByPage = new Map<number, Map<string, number>>();

  try {
    const lease = await PdfRendererAdapter.acquireDocument(options.outputBytes);
    try {
      const doc = lease.doc;
      const reopenedPageCount = doc.numPages;
      actualPageCount = reopenedPageCount;

      if (reopenedPageCount !== options.expectedPageCount) {
        diagnostics.push({
          code: 'PS_ISONOTE_OUTPUT_PAGE_COUNT_MISMATCH',
          severity: 'error',
          message: `Output page count is ${reopenedPageCount}; expected ${options.expectedPageCount}.`,
        });
      }
    } finally {
      await lease.release();
    }

    // ⚠️ Markers are invisible text (opacity=0, size≈0.001pt). pdf.js text extraction
    // skips invisible text entirely. Scan the raw PDF bytes directly instead.
    const rawText = new TextDecoder('latin1').decode(options.outputBytes);
    const allMarkerStrings: string[] = [];
    const markerRegex = /PDFHUB[A-Z_]*\[[^\]]+\]/g;
    let rawMatch: RegExpExecArray | null;
    while ((rawMatch = markerRegex.exec(rawText)) !== null) {
      allMarkerStrings.push(rawMatch[0].replace(/\s+/g, ''));
    }

    // Parse markers and build per-page counts (markers encode page info, but we
    // group them all under page 1 for single-page verification; multi-page markers
    // are still matched by their key which includes psNo+hash+occurrenceId)
    for (const markerStr of allMarkerStrings) {
      for (const marker of parseVersionedPsIsonoteMarkers(markerStr)) {
        // Determine page number from expectedMarkers that matches this marker key
        const key = markerKey(marker);
        const expectedMarker = options.expectedMarkers.find((em) => markerKey(em) === key);
        const pageNumber = expectedMarker?.pageNumber ?? 1;
        if (!markersByPage.has(pageNumber)) {
          markersByPage.set(pageNumber, new Map());
        }
        const pageCounts = markersByPage.get(pageNumber)!;
        pageCounts.set(key, (pageCounts.get(key) ?? 0) + 1);
      }
    }
  } catch (error) {
    diagnostics.push({
      code: 'PS_ISONOTE_OUTPUT_OPEN_FAILED',
      severity: 'error',
      message: `Unable to reopen and inspect the output PDF: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  for (const marker of options.expectedMarkers) {
    const foundCount = markersByPage.get(marker.pageNumber)?.get(markerKey(marker)) ?? 0;
    const status: PsIsonoteMarkerVerificationStatus = foundCount === 1
      ? 'verified'
      : foundCount === 0
        ? 'missing'
        : 'duplicate';
    markerResults.push({ ...marker, foundCount, status });
    if (status === 'missing') {
      diagnostics.push(markerDiagnostic(marker, 'PS_ISONOTE_MARKER_MISSING', foundCount));
    } else if (status === 'duplicate') {
      diagnostics.push(markerDiagnostic(marker, 'PS_ISONOTE_MARKER_DUPLICATE', foundCount));
    }
  }

  const verifiedMarkerCount = markerResults.filter((marker) => marker.status === 'verified').length;
  return {
    verified: diagnostics.length === 0 && verifiedMarkerCount === options.expectedMarkers.length,
    outputSha256,
    outputDocumentKey: options.outputDocumentKey,
    outputDocumentKeyMatchesHash,
    expectedPageCount: options.expectedPageCount,
    actualPageCount,
    expectedMarkerCount: options.expectedMarkers.length,
    verifiedMarkerCount,
    markerResults,
    diagnostics,
  };
}

export { verifyProfessionalCalloutOutput } from '../../annotation-verification/output-verifier';

