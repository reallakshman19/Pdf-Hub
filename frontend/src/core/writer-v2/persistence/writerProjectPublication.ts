import { getDocumentSessionGeneration, useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '../writerV2Store';

// Explicit project open wins over browser-local draft recovery for this exact session.
let publication: { fingerprint: string; generation: number; nativeBytes: Uint8Array | null } | null = null;
export function markWriterProjectPublished(fingerprint: string): void {
  publication = { fingerprint, generation: getDocumentSessionGeneration(), nativeBytes: useSessionStore.getState().workingBytes };
}
export function hasPublishedWriterProjectForSession(fingerprint: string): boolean {
  return publication?.fingerprint === fingerprint
    && publication.generation === getDocumentSessionGeneration()
    && (useSessionStore.getState().documentKey === fingerprint
      || (useSessionStore.getState().documentKey === null
        && useWriterV2Store.getState().documentMeta?.mode === 'blankDocument'))
    && useWriterV2Store.getState().currentDocumentFingerprint === fingerprint;
}

/** The embedded native model, not an earlier local sidecar, owns this initial source. */
export function hasPublishedNativeProjectSource(fingerprint: string, bytes: Uint8Array): boolean {
  return hasPublishedWriterProjectForSession(fingerprint) && publication?.nativeBytes === bytes
    && useSessionStore.getState().workingBytes === bytes;
}
