import type { DocumentSession } from '@/core/session/types';
import {
  resolveActivePdfRendererInput,
} from '@/core/session/activePdfRendererInput';
import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import {
  PdfRendererAdapter,
  type PdfDocumentLease,
} from './PdfRendererAdapter';

export type ActivePdfRendererSessionSnapshot = Pick<
  DocumentSession,
  | 'documentKey'
  | 'revisionStoreId'
  | 'originalRevisionId'
  | 'activeRevisionId'
  | 'workingBytes'
>;

/**
 * Acquire the PDF.js document matching an explicit session snapshot.
 *
 * Revision-aware sessions use the immutable active revision source. Legacy
 * sessions with no revision metadata keep the byte compatibility path.
 * Zustand ownership stays outside this adapter boundary.
 */
export async function acquireActivePdfDocumentLease(
  session: ActivePdfRendererSessionSnapshot,
  signal?: AbortSignal,
): Promise<PdfDocumentLease | null> {
  throwIfAborted(signal, 'resolve active PDF renderer input');

  const inputPromise = resolveActivePdfRendererInput(session);
  const input = await raceWithAbort(
    inputPromise,
    signal,
    'resolve active PDF renderer input',
  );

  if (!input) return null;

  if (input.kind === 'source') {
    return PdfRendererAdapter.acquireDocumentSource({
      source: input.source,
      cacheKey: input.cacheKey,
      signal,
    });
  }

  const leasePromise = PdfRendererAdapter.acquireDocument(
    input.bytes,
  );

  return raceWithAbort(
    leasePromise,
    signal,
    'load legacy byte-backed PDF document',
    () => {
      void leasePromise
        .then((lateLease) => lateLease.release())
        .catch(() => undefined);
    },
  );
}
