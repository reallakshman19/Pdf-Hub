import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import {
  admitAndOpenPdfFile,
  PRIMARY_PDF_OPEN_POLICY,
} from './openPdf';
import type { PageGraph, PageNode } from '@/core/pages/types';
import {
  clearDocumentSourceRegistryForTests,
  resolveDocumentSource,
} from '@/core/document-source/registry';

type TestFile = File & {
  arrayBuffer: ReturnType<typeof vi.fn>;
  slice: ReturnType<typeof vi.fn>;
};

function createFile(
  bytes: Uint8Array,
  overrides: Partial<Pick<File, 'name' | 'type' | 'size'>> = {},
): TestFile {
  const arrayBuffer = vi.fn(
    async () => Uint8Array.from(bytes).buffer,
  );
  const slice = vi.fn(
    (start = 0, end = bytes.byteLength) => {
      const copy = bytes.slice(start, end);
      return {
        arrayBuffer: async () =>
          Uint8Array.from(copy).buffer,
      } as Blob;
    },
  );

  return {
    name: overrides.name ?? 'sample.pdf',
    type: overrides.type ?? 'application/pdf',
    size: overrides.size ?? bytes.byteLength,
    arrayBuffer,
    slice,
  } as unknown as TestFile;
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}


function pageGraph(count: number, documentKey = 'sha256:fixture'): PageGraph<PageNode> {
  return {
    pages: Array.from({ length: count }, (_, index) => ({
      pageId: `${documentKey}::page::${index + 1}`,
      documentKey,
      originalPageNumber: index + 1,
      currentIndex: index,
      width: 595,
      height: 842,
      rotation: 0 as const,
    })),
  };
}

function pdfHeaderBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.7\nfixture');
}

afterEach(() => {
  clearDocumentSourceRegistryForTests();
  vi.restoreAllMocks();
});

describe('primary PDF admission coordinator', () => {
  it('preserves the existing FileAdapter source-byte policy', () => {
    expect(PRIMARY_PDF_OPEN_POLICY.authority).toEqual({
      kind: 'EXISTING_SOURCE_POLICY',
      sourceId: 'FileAdapter.MAX_PDF_SIZE_BYTES',
    });
    expect(PRIMARY_PDF_OPEN_POLICY.limits.SOURCE_BYTES).toBe(
      100 * 1024 * 1024,
    );
  });

  it('rejects over-limit metadata before reading file bytes', async () => {
    const file = createFile(new Uint8Array(), {
      size: FileAdapter.MAX_PDF_SIZE_BYTES + 1,
    });
    const commit = vi.fn();

    const result = await admitAndOpenPdfFile(file, 'LANDING_DROP', { commit });

    expect(result.outcome).toBe('REJECTED_POLICY_LIMIT');
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(file.slice).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects incompatible metadata before reading file bytes', async () => {
    const file = createFile(pdfHeaderBytes(), {
      name: 'sample.txt',
      type: 'text/plain',
    });
    const commit = vi.fn();

    const result = await admitAndOpenPdfFile(file, 'LANDING_DROP', { commit });

    expect(result.outcome).toBe('REJECTED_INVALID_FORMAT');
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(file.slice).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects a missing PDF signature before PageGraph parsing and hashing', async () => {
    const file = createFile(new TextEncoder().encode('not a PDF'));
    const hashBytes = vi.spyOn(FileAdapter, 'hashBytes');
    const buildPageGraph = vi.fn();
    const commit = vi.fn();

    const result = await admitAndOpenPdfFile(file, 'LANDING_DROP', {
      commit,
      buildPageGraph,
    });

    expect(result.outcome).toBe('REJECTED_INVALID_FORMAT');
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(file.slice).toHaveBeenCalledTimes(1);
    expect(file.slice).toHaveBeenCalledWith(
      0,
      file.size,
    );
    expect(buildPageGraph).not.toHaveBeenCalled();
    expect(hashBytes).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('reads only the bounded signature prefix before rejecting a large non-PDF payload', async () => {
    const bytes = new Uint8Array(4096);
    const file = createFile(bytes);
    const hashBytes = vi.spyOn(FileAdapter, 'hashBytes');
    const buildPageGraph = vi.fn();
    const commit = vi.fn();

    const result = await admitAndOpenPdfFile(
      file,
      'LANDING_DROP',
      {
        commit,
        buildPageGraph,
      },
    );

    expect(result.outcome).toBe(
      'REJECTED_INVALID_FORMAT',
    );
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(file.slice).toHaveBeenCalledTimes(1);
    expect(file.slice).toHaveBeenCalledWith(0, 1024);
    expect(hashBytes).not.toHaveBeenCalled();
    expect(buildPageGraph).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('commits one accepted PDF exactly once', async () => {
    const file = createFile(pdfHeaderBytes());
    vi.spyOn(FileAdapter, 'hashBytes').mockResolvedValue('sha256:fixture');
    const buildPageGraph = vi.fn().mockResolvedValue(pageGraph(3));
    const commit = vi.fn();

    const result = await admitAndOpenPdfFile(file, 'TOOLBAR_PICKER', {
      commit,
      buildPageGraph,
    });

    expect(result.outcome).toBe('ACCEPTED');
    if (result.outcome !== 'ACCEPTED') return;

    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(file.slice).toHaveBeenCalledTimes(2);
    expect(file.slice).toHaveBeenNthCalledWith(
      1,
      0,
      file.size,
    );
    expect(file.slice).toHaveBeenNthCalledWith(
      2,
      0,
      file.size,
    );
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({
      documentKey: 'sha256:fixture',
      sourceId: result.value.sourceId,
      fileName: 'sample.pdf',
      bytes: expect.any(Uint8Array),
      pageCount: 3,
      pageGraph: pageGraph(3),
      saveHandle: null,
    });
    expect(result.value.sourceId).toMatch(
      /^primary-pdf:/,
    );
    expect(
      resolveDocumentSource(result.value.sourceId),
    ).not.toBeNull();
    expect(result.evidence.measurements).toEqual([
      {
        metric: 'SOURCE_BYTES',
        actual: file.size,
        limit: FileAdapter.MAX_PDF_SIZE_BYTES,
        unit: 'bytes',
      },
      {
        metric: 'PDF_PAGE_COUNT',
        actual: 3,
        unit: 'count',
      },
    ]);
  });

  it('does not commit when PageGraph parsing fails', async () => {
    const file = createFile(pdfHeaderBytes());
    vi.spyOn(FileAdapter, 'hashBytes').mockResolvedValue('sha256:broken');
    const buildPageGraph = vi.fn().mockRejectedValue(new Error('broken xref'));
    const commit = vi.fn();

    const result = await admitAndOpenPdfFile(file, 'WORKSPACE_PICKER', {
      commit,
      buildPageGraph,
    });

    expect(result.outcome).toBe('REJECTED_INVALID_FORMAT');
    expect(buildPageGraph).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it('does not commit when cancellation arrives before the final checkpoint', async () => {
    const file = createFile(pdfHeaderBytes());
    const controller = new AbortController();
    vi.spyOn(FileAdapter, 'hashBytes').mockImplementation(async () => {
      controller.abort('superseded');
      return 'sha256:cancelled';
    });
    const commit = vi.fn();

    const result = await admitAndOpenPdfFile(file, 'WORKSPACE_PICKER', {
      signal: controller.signal,
      commit,
      buildPageGraph: vi.fn().mockResolvedValue(pageGraph(1, 'sha256:cancelled')),
    });

    expect(result.outcome).toBe('CANCELLED');
    expect(commit).not.toHaveBeenCalled();
  });

  it('suppresses a late result after a newer open operation starts', async () => {
    const firstFile = createFile(pdfHeaderBytes(), { name: 'first.pdf' });
    const secondFile = createFile(pdfHeaderBytes(), { name: 'second.pdf' });
    const firstGraph = createDeferred<PageGraph<PageNode>>();
    vi.spyOn(FileAdapter, 'hashBytes')
      .mockResolvedValueOnce('sha256:first')
      .mockResolvedValueOnce('sha256:second');
    const firstCommit = vi.fn();
    const secondCommit = vi.fn();

    const firstResultPromise = admitAndOpenPdfFile(firstFile, 'LANDING_DROP', {
      commit: firstCommit,
      buildPageGraph: () => firstGraph.promise,
    });
    const secondResult = await admitAndOpenPdfFile(secondFile, 'TOOLBAR_PICKER', {
      commit: secondCommit,
      buildPageGraph: vi.fn().mockResolvedValue(pageGraph(2, 'sha256:second')),
    });
    firstGraph.resolve(pageGraph(1, 'sha256:first'));
    const firstResult = await firstResultPromise;

    expect(secondResult.outcome).toBe('ACCEPTED');
    expect(secondCommit).toHaveBeenCalledTimes(1);
    expect(firstResult.outcome).toBe('CANCELLED');
    expect(firstCommit).not.toHaveBeenCalled();
  });
});
