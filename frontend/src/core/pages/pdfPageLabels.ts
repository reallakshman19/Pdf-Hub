import type { PDFDocumentProxy } from 'pdfjs-dist';

import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '../cancellation/operationCancellation';
import { warn } from '../logger/service';

/**
 * Reads resolved logical page labels from PDF.js.
 *
 * PDF.js owns parsing of the PDF /PageLabels number tree, including the
 * standard /D, /r, /R, /a, /A styles plus /P prefixes and /St restarts.
 * PDF Hub deliberately consumes the resolved labels rather than introducing
 * a second PDF parser solely for page-label metadata.
 *
 * A malformed/inconsistent label tree fails soft to null so document
 * admission and rendering remain available.
 */
export async function readResolvedPdfPageLabels(
  doc: Pick<PDFDocumentProxy, 'numPages' | 'getPageLabels'>,
  signal?: AbortSignal,
): Promise<string[] | null> {
  try {
    throwIfAborted(signal, 'read PDF page labels');
    const labels = await raceWithAbort(
      doc.getPageLabels(),
      signal,
      'read PDF page labels',
    );
    throwIfAborted(signal, 'validate PDF page labels');

    if (labels === null) return null;

    if (
      !Array.isArray(labels)
      || labels.length !== doc.numPages
      || labels.some((label) => typeof label !== 'string')
    ) {
      warn('pdf-renderer', 'Ignoring inconsistent PDF page labels', {
        expectedPages: doc.numPages,
        actualLabels: Array.isArray(labels) ? labels.length : -1,
      });
      return null;
    }

    return [...labels];
  } catch (labelError) {
    if (isOperationCancelledError(labelError)) throw labelError;

    warn('pdf-renderer', 'Unable to read PDF page labels; using physical page numbers', {
      error: String(labelError),
    });
    return null;
  }
}
