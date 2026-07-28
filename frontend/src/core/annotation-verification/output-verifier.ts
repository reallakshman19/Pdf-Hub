// src/core/annotation-verification/output-verifier.ts
// ⚠️ INVARIANT: This function MUST be called after PdfEditAdapter.drawProfessionalCallout()
//   and BEFORE reporting success to the user or binding the audit manifest.
// ⚠️ INVARIANT: Verification reads the OUTPUT bytes — not the planning-time models (AD-07).
// ⚠️ NOTE: Markers are written as invisible text (opacity 0, size ~0.001pt). pdf.js skips
//   invisible text, so we scan the raw PDF byte stream directly — much faster and 100% reliable.

import { PdfRendererAdapter } from '../../adapters/pdf-renderer/PdfRendererAdapter';
import { verifyWrittenPage, type VerificationReport } from '../macro/psIsonote/professional/verificationCore';
import type { ProfessionalCalloutModel } from '../macro/psIsonote/professional/model';

/**
 * Scans raw PDF bytes for PDFHUBISONOTE marker strings.
 * This is needed because markers are invisible text and pdf.js text extraction skips them.
 */
function scanBytesForMarkers(bytes: Uint8Array): string[] {
  const decoder = new TextDecoder('latin1'); // use latin1 to avoid replacement chars
  const raw = decoder.decode(bytes);
  const markers: string[] = [];
  const pattern = /PDFHUBISONOTE\[[^\]]+\]/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(raw)) !== null) {
    // Remove any embedded whitespace that pdf stream encoding may have introduced
    markers.push(m[0].replace(/\s+/g, ''));
  }
  return [...new Set(markers)]; // deduplicate
}

export async function verifyProfessionalCalloutOutput(
  outputBytes: Uint8Array,
  expectedCallouts: ProfessionalCalloutModel[],
  mappingHash: string,
  signal?: AbortSignal,
): Promise<VerificationReport> {
  if (signal?.aborted) {
    throw new Error('Operation aborted during professional callout verification.');
  }

  // 1. Scan raw bytes for markers (invisible text — cannot use pdf.js text layer)
  const allFoundMarkers = scanBytesForMarkers(outputBytes);

  // 2. Reload the PDF via PdfRendererAdapter to extract VISIBLE text for content verification
  const lease = await PdfRendererAdapter.acquireDocument(outputBytes);
  const allVisibleText: string[] = [];
  try {
    const doc = lease.doc;
    const numPages = doc.numPages;
    const pageNumbers = [...new Set(expectedCallouts.map(c => (c as any).pageNumber ?? 1))];

    for (const pageNum of pageNumbers) {
      if (pageNum > numPages || pageNum < 1) continue;
      if (signal?.aborted) {
        throw new Error('Operation aborted during text layer extraction for verification.');
      }
      const page = await doc.getPage(pageNum);
      try {
        const textItems = await PdfRendererAdapter.getPageTextItems(page, 1);
        for (const item of textItems) {
          allVisibleText.push(item.text);
        }
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await lease.release();
  }

  // 3. Run the existing verifyWrittenPage check
  return verifyWrittenPage(expectedCallouts, allFoundMarkers, allVisibleText, mappingHash);
}
