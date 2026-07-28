// src/core/annotation-verification/output-verifier.ts
// ⚠️ INVARIANT: This function MUST be called after PdfEditAdapter.drawProfessionalCallout()
//   and BEFORE reporting success to the user or binding the audit manifest.
// ⚠️ INVARIANT: Verification reads the OUTPUT bytes — not the planning-time models (AD-07).

import { PdfRendererAdapter } from '../../adapters/pdf-renderer/PdfRendererAdapter';
import { verifyWrittenPage, type VerificationReport } from '../macro/psIsonote/professional/verificationCore';
import type { ProfessionalCalloutModel } from '../macro/psIsonote/professional/model';

export async function verifyProfessionalCalloutOutput(
  outputBytes: Uint8Array,
  expectedCallouts: ProfessionalCalloutModel[],
  mappingHash: string,
  signal?: AbortSignal,
): Promise<VerificationReport> {
  if (signal?.aborted) {
    throw new Error('Operation aborted during professional callout verification.');
  }

  // 1. Reload the PDF via PdfRendererAdapter to verify round-trip persistence
  const lease = await PdfRendererAdapter.acquireDocument(outputBytes);
  try {
    const doc = lease.doc;
    const numPages = doc.numPages;

    // 2. Extract text layer from each page that was modified
    const pageNumbers = [...new Set(expectedCallouts.map(c => c.pageNumber ?? 1))];
    const allFoundMarkers: string[] = [];
    const allVisibleText: string[] = [];

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
          if (item.text.startsWith('PDFHUBISONOTE[')) {
            allFoundMarkers.push(item.text);
          }
        }
      } finally {
        page.cleanup();
      }
    }

    // 3. Run the existing verifyWrittenPage check
    return verifyWrittenPage(expectedCallouts, allFoundMarkers, allVisibleText, mappingHash);
  } finally {
    await lease.release();
  }
}
