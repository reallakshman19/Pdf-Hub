import type { DocumentSource } from '@/core/document-source/types';
import {
  resolveWorkingRevisionStore,
} from '@/core/revision-store/registry';
import type { DocumentSession } from './types';

export type ActivePdfRendererInput =
  | {
      readonly kind: 'source';
      readonly source: DocumentSource;
      readonly cacheKey: string;
    }
  | {
      readonly kind: 'bytes';
      readonly bytes: Uint8Array;
    };

type ActivePdfRendererSession = Pick<
  DocumentSession,
  | 'documentKey'
  | 'revisionStoreId'
  | 'originalRevisionId'
  | 'activeRevisionId'
  | 'workingBytes'
>;

/**
 * Resolve the active PDF renderer substrate without exposing session/Zustand
 * state to the renderer adapter.
 *
 * Legacy byte-only sessions have no revision metadata at all. Once any
 * revision metadata exists, rendering is strict: missing/stale active revision
 * state is an error rather than a silent fallback to potentially stale bytes.
 */
export async function resolveActivePdfRendererInput(
  session: ActivePdfRendererSession,
): Promise<ActivePdfRendererInput | null> {
  const {
    documentKey,
    revisionStoreId,
    originalRevisionId,
    activeRevisionId,
    workingBytes,
  } = session;

  const revisionValues = [
    revisionStoreId,
    originalRevisionId,
    activeRevisionId,
  ];
  const revisionMetadataPresent = revisionValues.some(
    (value) => value !== null,
  );

  if (!revisionMetadataPresent) {
    return workingBytes
      ? { kind: 'bytes', bytes: workingBytes }
      : null;
  }

  if (
    !revisionStoreId
    || !originalRevisionId
    || !activeRevisionId
  ) {
    throw new Error(
      'Revision-aware PDF session is missing a durable active revision.',
    );
  }

  if (!documentKey) {
    throw new Error(
      'Revision-aware PDF session is missing documentKey.',
    );
  }

  if (activeRevisionId !== documentKey) {
    throw new Error(
      `Active PDF revision ${activeRevisionId} does not match documentKey ${documentKey}.`,
    );
  }

  const store = resolveWorkingRevisionStore(
    revisionStoreId,
  );
  if (!store) {
    throw new Error(
      `WorkingRevisionStore ${revisionStoreId} is not registered for active PDF rendering.`,
    );
  }

  const source = await store.open(activeRevisionId);
  return {
    kind: 'source',
    source,
    cacheKey: activeRevisionId,
  };
}
