import type { PDFDocumentProxy } from 'pdfjs-dist';

import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '../cancellation/operationCancellation';
import { warn } from '../logger/service';
import { createPageGraph } from './pageGraph';
import type { PageGraph, PageNode } from './types';

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

/**
 * Attaches already-resolved logical labels to PageGraph without changing
 * stable PageIds or physical order.
 */
export function applyResolvedPdfPageLabels<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  labels: readonly string[] | null,
): PageGraph<TPage> {
  if (!labels || labels.length !== graph.pages.length) {
    return createPageGraph(
      graph.pages.map((page) => {
        const next = { ...page };
        delete next.logicalLabel;
        return next;
      }),
    );
  }

  return createPageGraph(
    graph.pages.map((page, index) => ({
      ...page,
      logicalLabel: labels[index] ?? '',
    })),
  );
}
