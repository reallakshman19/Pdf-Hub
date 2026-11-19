import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../../session/store';
import { useOcrStore } from '../ocrStore';

const bbox = { x: 20, y: 40, width: 100, height: 30 };
const at = '2026-11-19T00:00:00.000Z';

describe('WP05 active-document OCR owner guards', () => {
  beforeEach(() => {
    useSessionStore.getState().clearDocument();
    useOcrStore.getState().clearOcr();
    useSessionStore.getState().openDocument({
      documentKey: 'document-B',
      fileName: 'document-B.pdf',
      bytes: new Uint8Array([37, 80, 68, 70, 45]),
      pageCount: 1,
    });
    useOcrStore.getState().hydrateOcrSession({ documentFingerprint: 'document-B' });
  });

  afterEach(() => {
    useOcrStore.getState().clearOcr();
    useSessionStore.getState().clearDocument();
  });

  it('does not publish stale A correction, region or focus after B admission', () => {
    const oldRegion = {
      id: 'region-A',
      documentFingerprint: 'document-A',
      pageIndex: 0,
      bbox,
      mode: 'text' as const,
      createdAt: at,
      updatedAt: at,
    };
    useOcrStore.getState().upsertOcrRegion(oldRegion);
    expect(useOcrStore.getState().addOcrRegion({
      id: 'region-A-again', documentFingerprint: 'document-A', pageIndex: 0,
      bbox, mode: 'text',
    })).toBeNull();
    useOcrStore.getState().upsertOcrCorrection({
      id: 'correction-A', documentFingerprint: 'document-A', pageIndex: 0,
      targetId: 'word-A', targetType: 'word', originalText: 'A',
      correctedText: 'ALPHA', bbox, createdAt: at, updatedAt: at,
    });
    useOcrStore.getState().focusOcrTarget({
      documentFingerprint: 'document-A', pageIndex: 0, bbox,
      targetId: 'word-A', source: 'lowConfidence', requestedAt: 1,
    });
    expect(useOcrStore.getState().regions).toEqual([]);
    expect(useOcrStore.getState().corrections).toEqual([]);
    expect(useOcrStore.getState().reviewFocus).toBeNull();
  });

  it('still permits active B region and correction publication', () => {
    const region = useOcrStore.getState().addOcrRegion({
      id: 'region-B', documentFingerprint: 'document-B',
      pageIndex: 0, bbox, mode: 'text',
    });
    expect(region?.documentFingerprint).toBe('document-B');
    expect(useOcrStore.getState().regions).toHaveLength(1);
    useOcrStore.getState().upsertOcrCorrection({
      id: 'correction-B', documentFingerprint: 'document-B', pageIndex: 0,
      targetId: 'word-B', targetType: 'word', originalText: 'B',
      correctedText: 'BETA', bbox, createdAt: at, updatedAt: at,
    });
    expect(useOcrStore.getState().corrections).toHaveLength(1);
  });
});
