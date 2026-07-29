// src/core/annotation-verification/output-verifier.ts
// Per-operation verification is limited to the output that the current operation can
// actually produce. PS/ISONOTE identity markers are appended by later recipe steps and
// are verified once, after the complete macro transaction has finished.

import { PdfRendererAdapter } from '../../adapters/pdf-renderer/PdfRendererAdapter';
import type { VerificationReport } from '../macro/psIsonote/professional/verificationCore';
import type { ProfessionalCalloutModel } from '../macro/psIsonote/professional/model';

function normalizeSearchableText(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '');
}

function expectedVisibleText(callout: ProfessionalCalloutModel): {
  tagHeader: string;
  notePrefix: string;
} {
  return {
    tagHeader: /^Tag(\s*No\.|:|\s)/i.test(callout.tag)
      ? callout.tag
      : `Tag: ${callout.tag}`,
    notePrefix: callout.note.startsWith('ISO Note: ')
      ? callout.note
      : `ISO Note: ${callout.note}`,
  };
}

/**
 * Verifies the visible, searchable text written by professional callout operations.
 *
 * Marker verification is intentionally excluded here. The PS/ISONOTE recipe writes
 * versioned markers after all callout operations, so requiring a marker at this step
 * would reject a valid intermediate state and discard the newly written PDF bytes.
 */
export async function verifyProfessionalCalloutOutput(
  outputBytes: Uint8Array,
  expectedCallouts: ProfessionalCalloutModel[],
  _mappingHash: string,
  signal?: AbortSignal,
): Promise<VerificationReport> {
  if (signal?.aborted) {
    throw new Error('Operation aborted during professional callout verification.');
  }

  const lease = await PdfRendererAdapter.acquireDocument(outputBytes);
  const visibleTextItems: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= lease.doc.numPages; pageNumber += 1) {
      if (signal?.aborted) {
        throw new Error('Operation aborted during text layer extraction for verification.');
      }

      const page = await lease.doc.getPage(pageNumber);
      try {
        const textItems = await PdfRendererAdapter.getPageTextItems(page, 1);
        visibleTextItems.push(...textItems.map((item) => item.text));
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await lease.release();
  }

  const searchableText = normalizeSearchableText(visibleTextItems.join(' '));
  const missingTextErrors: string[] = [];
  let verifiedCount = 0;

  for (const expected of expectedCallouts) {
    const { tagHeader, notePrefix } = expectedVisibleText(expected);
    const hasTag = searchableText.includes(normalizeSearchableText(tagHeader));
    const hasNote = searchableText.includes(normalizeSearchableText(notePrefix));

    if (!hasTag || !hasNote) {
      missingTextErrors.push(
        `Expected visible searchable text for occurrence ${expected.id} ` +
        `(${tagHeader} / ${notePrefix}) is absent from the written PDF.`,
      );
      continue;
    }

    verifiedCount += 1;
  }

  return {
    passed: missingTextErrors.length === 0 && verifiedCount === expectedCallouts.length,
    verifiedCount,
    missingMarkerErrors: [],
    duplicateErrors: [],
    mismatchErrors: [],
    missingTextErrors,
  };
}
