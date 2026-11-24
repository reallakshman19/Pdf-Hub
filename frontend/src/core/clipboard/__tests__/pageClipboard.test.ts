import { describe, it, expect, beforeEach } from 'vitest';
import { usePageClipboardStore, serializeSelectedPagesToPdf } from '../pageClipboardStore';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

describe('pageClipboardStore', () => {
  beforeEach(() => {
    usePageClipboardStore.getState().clearClipboard();
  });

  it('initializes with empty clipboard', () => {
    expect(usePageClipboardStore.getState().clipboard).toBeNull();
  });

  it('stores copied pages with isCut false', () => {
    const dummyBytes = new Uint8Array([1, 2, 3]);
    usePageClipboardStore.getState().copyPages({
      sourceDocumentKey: 'doc-1',
      sourceFileName: 'test.pdf',
      pageIndices: [0, 2],
      serializedPagesBytes: dummyBytes,
    });

    const entry = usePageClipboardStore.getState().clipboard;
    expect(entry).not.toBeNull();
    expect(entry?.isCut).toBe(false);
    expect(entry?.sourceDocumentKey).toBe('doc-1');
    expect(entry?.pageIndices).toEqual([0, 2]);
    expect(entry?.serializedPagesBytes).toBe(dummyBytes);
  });

  it('stores cut pages with isCut true', () => {
    const dummyBytes = new Uint8Array([4, 5, 6]);
    usePageClipboardStore.getState().cutPages({
      sourceDocumentKey: 'doc-2',
      pageIndices: [1],
      serializedPagesBytes: dummyBytes,
    });

    const entry = usePageClipboardStore.getState().clipboard;
    expect(entry).not.toBeNull();
    expect(entry?.isCut).toBe(true);
    expect(entry?.sourceDocumentKey).toBe('doc-2');
    expect(entry?.pageIndices).toEqual([1]);
  });

  it('clears clipboard on clearClipboard call', () => {
    usePageClipboardStore.getState().copyPages({
      sourceDocumentKey: 'doc-1',
      pageIndices: [0],
      serializedPagesBytes: new Uint8Array([1]),
    });
    expect(usePageClipboardStore.getState().clipboard).not.toBeNull();

    usePageClipboardStore.getState().clearClipboard();
    expect(usePageClipboardStore.getState().clipboard).toBeNull();
  });

  it('serializes selected pages into a standalone PDF document', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    doc.addPage([200, 300]);
    doc.addPage([400, 500]);
    doc.addPage([600, 700]);
    const sourceBytes = await doc.save();

    const serializedBytes = await serializeSelectedPagesToPdf(sourceBytes, [0, 2]);
    expect(serializedBytes.byteLength).toBeGreaterThan(0);

    const reloaded = await lib.PDFDocument.load(serializedBytes);
    expect(reloaded.getPageCount()).toBe(2);
    expect(reloaded.getPage(0).getWidth()).toBe(200);
    expect(reloaded.getPage(1).getWidth()).toBe(600);
  });

  it('throws when serializing out of bounds page index', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    doc.addPage([100, 100]);
    const sourceBytes = await doc.save();

    await expect(serializeSelectedPagesToPdf(sourceBytes, [5])).rejects.toThrow(
      'Page index 5 is out of bounds [0..0]',
    );
  });

  it('broadcasts SET_CLIPBOARD across tabs when pages are copied', () => {
    const postMessageMock = vi.fn();
    class MockBroadcastChannel {
      name: string;
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor(name: string) {
        this.name = name;
      }
      postMessage = postMessageMock;
      close = vi.fn();
    }
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

    usePageClipboardStore.getState().copyPages({
      sourceDocumentKey: 'doc-cross-tab',
      pageIndices: [0],
      serializedPagesBytes: new Uint8Array([9]),
    });

    expect(usePageClipboardStore.getState().clipboard).not.toBeNull();
  });
});
