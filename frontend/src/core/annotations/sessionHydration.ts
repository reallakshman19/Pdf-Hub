import { getDocumentSessionGeneration, useSessionStore } from '@/core/session/store';

let hydrated: { key: string; generation: number; bytes: Uint8Array } | null = null;
export function markNativeAnnotationsHydrated(key: string, bytes: Uint8Array): void {
  hydrated = { key, bytes, generation: getDocumentSessionGeneration() };
}
export function isNativeAnnotationHydrationCurrent(key: string): boolean {
  const session = useSessionStore.getState();
  return hydrated?.key === key && hydrated.generation === getDocumentSessionGeneration()
    && session.documentKey === key && session.workingBytes === hydrated.bytes;
}
