import { describe, expect, it, vi } from 'vitest';

import type { DocumentSource } from '@/core/document-source/types';

vi.mock('pdfjs-dist', () => ({
  PDFDataRangeTransport: class {
    constructor(
      readonly length: number,
      readonly initialData: Uint8Array | null,
    ) {}

    onDataRange(
      _begin: number,
      _chunk: Uint8Array,
    ): void {}

    requestDataRange(
      _begin: number,
      _end: number,
    ): void {
      throw new Error('abstract');
    }

    abort(): void {}
  },
}));

import { PdfJsDocumentSourceTransport } from './PdfJsDocumentSourceTransport';

function source(
  bytes: Uint8Array,
  read = vi.fn(async (offset: number, length: number) =>
    bytes.slice(offset, offset + length)),
): DocumentSource {
  return {
    id: 'revision:test:sha256',
    kind: 'opfs',
    capabilities: {
      randomAccess: true,
      immutableReads: true,
      persistent: true,
    },
    size: async () => bytes.byteLength,
    read,
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('PdfJsDocumentSourceTransport', () => {
  it('maps PDF.js [begin,end) requests to exact DocumentSource reads', async () => {
    const read = vi.fn(async (offset: number, length: number) =>
      Uint8Array.from([offset, length, 9, 10]));
    const transport = new PdfJsDocumentSourceTransport({
      source: source(new Uint8Array(32), read),
      size: 32,
      onFatalError: vi.fn(),
    });
    const onDataRange = vi.spyOn(transport, 'onDataRange');

    expect(read).not.toHaveBeenCalled();

    transport.requestDataRange(8, 12);
    await flush();

    expect(read).toHaveBeenCalledWith(8, 4);
    expect(onDataRange).toHaveBeenCalledTimes(1);
    expect(onDataRange).toHaveBeenCalledWith(
      8,
      Uint8Array.from([8, 4, 9, 10]),
    );
    expect(transport.getDiagnostics()).toMatchObject({
      rangeRequests: 1,
      rangeBytesDelivered: 4,
      maxRequestedRangeBytes: 4,
      failed: false,
      aborted: false,
    });
  });

  it('fails closed for zero-length or out-of-bounds requests', async () => {
    const read = vi.fn();
    const fatal = vi.fn();
    const transport = new PdfJsDocumentSourceTransport({
      source: source(new Uint8Array(10), read),
      size: 10,
      onFatalError: fatal,
    });

    transport.requestDataRange(4, 4);
    transport.requestDataRange(0, 11);
    await flush();

    expect(read).not.toHaveBeenCalled();
    expect(fatal).toHaveBeenCalledTimes(1);
    expect(transport.getDiagnostics()).toMatchObject({
      rangeRequests: 0,
      failed: true,
    });
  });

  it('suppresses a late range delivery after abort', async () => {
    let resolveRead!: (value: Uint8Array) => void;
    const read = vi.fn(
      () => new Promise<Uint8Array>((resolve) => {
        resolveRead = resolve;
      }),
    );
    const fatal = vi.fn();
    const transport = new PdfJsDocumentSourceTransport({
      source: source(new Uint8Array(8), read),
      size: 8,
      onFatalError: fatal,
    });
    const onDataRange = vi.spyOn(transport, 'onDataRange');

    transport.requestDataRange(0, 4);
    transport.abort();
    resolveRead(Uint8Array.from([1, 2, 3, 4]));
    await flush();

    expect(onDataRange).not.toHaveBeenCalled();
    expect(fatal).not.toHaveBeenCalled();
    expect(transport.getDiagnostics()).toMatchObject({
      aborted: true,
      rangeBytesDelivered: 0,
    });
  });

  it('reports a source read failure once and stops future requests', async () => {
    const read = vi.fn().mockRejectedValue(
      new Error('OPFS read failed'),
    );
    const fatal = vi.fn();
    const transport = new PdfJsDocumentSourceTransport({
      source: source(new Uint8Array(8), read),
      size: 8,
      onFatalError: fatal,
    });

    transport.requestDataRange(0, 4);
    await flush();
    transport.requestDataRange(4, 8);
    await flush();

    expect(fatal).toHaveBeenCalledTimes(1);
    expect(fatal).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'OPFS read failed',
      }),
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(transport.getDiagnostics().failed).toBe(true);
  });

  it('fails if a source violates exact-length read semantics', async () => {
    const fatal = vi.fn();
    const transport = new PdfJsDocumentSourceTransport({
      source: source(
        new Uint8Array(8),
        vi.fn().mockResolvedValue(
          Uint8Array.from([1, 2]),
        ),
      ),
      size: 8,
      onFatalError: fatal,
    });

    transport.requestDataRange(0, 4);
    await flush();

    expect(fatal).toHaveBeenCalledTimes(1);
    expect(transport.getDiagnostics()).toMatchObject({
      rangeRequests: 1,
      rangeBytesDelivered: 0,
      failed: true,
    });
  });
});
