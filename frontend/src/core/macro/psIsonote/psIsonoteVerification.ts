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
    // Phase 1: Page count check via pdf.js
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

    // Phase 2: Marker extraction via pdf-lib (decompresses FlateDecode streams)
    // ⚠️ Markers are invisible text (opacity=0, size≈0.001pt). pdf.js text extraction
    // skips invisible text. Raw byte scans fail because PDF content streams are compressed.
    // pdf-lib decompresses on load → we can scan the decompressed content for marker strings.
    const { PDFDocument } = await import('pdf-lib');
    const pdfLibDoc = await PDFDocument.load(options.outputBytes, { ignoreEncryption: true });
    const pages = pdfLibDoc.getPages();

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      // Get content stream as raw bytes, decode to text, and scan for markers
      const contentStream = page.node.Contents();
      if (!contentStream) continue;

      // Collect all raw content bytes from the page
      let rawContent = '';
      const pdfDoc = pdfLibDoc.context;

      // Handle both single stream and array of streams
      if ('get' in contentStream && typeof contentStream.get === 'function') {
        // It's a PDFArray
        const arr = contentStream as any;
        const size = arr.size?.() ?? arr.length ?? 0;
        for (let i = 0; i < size; i++) {
          const ref = arr.get(i);
          const stream = ref ? pdfDoc.lookup(ref) : null;
          if (stream && 'getContents' in stream) {
            const bytes = (stream as any).getContents();
            rawContent += new TextDecoder('latin1').decode(bytes);
          }
        }
      } else if ('getContents' in contentStream) {
        // It's a single PDFStream
        const bytes = (contentStream as any).getContents();
        rawContent += new TextDecoder('latin1').decode(bytes);
      } else {
        // It might be a reference
        const resolved = pdfDoc.lookup(contentStream as any);
        if (resolved && 'getContents' in (resolved as any)) {
          const bytes = (resolved as any).getContents();
          rawContent += new TextDecoder('latin1').decode(bytes);
        }
      }

      // Scan decompressed content for PDFHUBISONOTE markers
      const pageNumber = pageIdx + 1;
      const counts = markersByPage.get(pageNumber) ?? new Map<string, number>();
      const markerRegex = /PDFHUBISONOTE\[[^\]]+\]/gi;
      let rawMatch: RegExpExecArray | null;
      while ((rawMatch = markerRegex.exec(rawContent)) !== null) {
        const cleanedMarker = rawMatch[0].replace(/\s+/g, '');
        for (const marker of parseVersionedPsIsonoteMarkers(cleanedMarker)) {
          const key = markerKey(marker);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      if (counts.size > 0) {
        markersByPage.set(pageNumber, counts);
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

