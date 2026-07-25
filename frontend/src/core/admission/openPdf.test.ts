import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import {
  admitAndOpenPdfFile,
  PRIMARY_PDF_OPEN_POLICY,
} from './openPdf';

function createFile(
  bytes: Uint8Array,
  overrides: Partial<Pick<File, 'name' | 'type' | 'size'>> = {},
): File & { arrayBuffer: ReturnType<typeof vi.fn> } {
  const arrayBuffer = vi.fn(async () => bytes.slice().buffer);
  return {
    name: overrides.name ?? 'sample.pdf',
    type: overrides.type ?? 'application/pdf',
    size: overrides.size ?? bytes.byteLength,
    arrayBuffer,
  } as unknown as File & { arrayBuffer: ReturnType<typeof vi.fn> };
}

function pdfHeaderBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.7\nfixture');
}

afterEach(() => {
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
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects a missing PDF signature before page parsing and hashing', async () => {
    const file = createFile(new TextEncoder().encode('not a PDF'));
    const countPages = vi.spyOn(PdfEditAdapter, 'countPages');
    const hashBytes = vi.spyOn(FileAdapter, 'hashBytes');
    const commit = vi.fn();

    const result = await admitAndOpenPdfFile(file, 'LANDING_DROP', { commit });

    expect(result.outcome).toBe('REJECTED_INVALID_FORMAT');
    expect(countPages).not.toHaveBeenCalled();
    expect(hashBytes).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('commits one accepted PDF exactly once', async () => {
    const file = createFile(pdfHeaderBytes());
    vi.spyOn(PdfEditAdapter, 'countPages').mockResolvedValue(3);
    vi.spyOn(FileAdapter, 'hashBytes').mockResolvedValue('sha256:fixture');
    const commit = vi.fn();

    const result = await admitAndOpenPdfFile(file, 'TOOLBAR_PICKER', { commit });

    expect(result.outcome).toBe('ACCEPTED');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({
      documentKey: 'sha256:fixture',
      fileName: 'sample.pdf',
      bytes: expect.any(Uint8Array),
      pageCount: 3,
      saveHandle: null,
    });
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

  it('does not commit when parsing fails', async () => {
    const file = createFile(pdfHeaderBytes());
    vi.spyOn(PdfEditAdapter, 'countPages').mockRejectedValue(new Error('broken xref'));
    const hashBytes = vi.spyOn(FileAdapter, 'hashBytes');
    const commit = vi.fn();

    const result = await admitAndOpenPdfFile(file, 'WORKSPACE_PICKER', { commit });

    expect(result.outcome).toBe('REJECTED_INVALID_FORMAT');
    expect(hashBytes).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('does not commit when cancellation arrives before the final checkpoint', async () => {
    const file = createFile(pdfHeaderBytes());
    const controller = new AbortController();
    vi.spyOn(PdfEditAdapter, 'countPages').mockResolvedValue(1);
    vi.spyOn(FileAdapter, 'hashBytes').mockImplementation(async () => {
      controller.abort('superseded');
      return 'sha256:cancelled';
    });
    const commit = vi.fn();

    const result = await admitAndOpenPdfFile(file, 'WORKSPACE_PICKER', {
      signal: controller.signal,
      commit,
    });

    expect(result.outcome).toBe('CANCELLED');
    expect(commit).not.toHaveBeenCalled();
  });

  it('suppresses a late result after a newer open operation starts', async () => {
    const firstFile = createFile(pdfHeaderBytes(), { name: 'first.pdf' });
    const secondFile = createFile(pdfHeaderBytes(), { name: 'second.pdf' });
    let resolveFirstCount: ((value: number) => void) | undefined;
    const firstCount = new Promise<number>((resolve) => {
      resolveFirstCount = resolve;
    });
    vi.spyOn(PdfEditAdapter, 'countPages')
      .mockImplementationOnce(() => firstCount)
      .mockResolvedValueOnce(2);
    vi.spyOn(FileAdapter, 'hashBytes')
      .mockResolvedValueOnce('sha256:second')
      .mockResolvedValueOnce('sha256:first');
    const firstCommit = vi.fn();
    const secondCommit = vi.fn();

    const firstResultPromise = admitAndOpenPdfFile(firstFile, 'LANDING_DROP', {
      commit: firstCommit,
    });
    const secondResult = await admitAndOpenPdfFile(secondFile, 'TOOLBAR_PICKER', {
      commit: secondCommit,
    });
    resolveFirstCount?.(1);
    const firstResult = await firstResultPromise;

    expect(secondResult.outcome).toBe('ACCEPTED');
    expect(secondCommit).toHaveBeenCalledTimes(1);
    expect(firstResult.outcome).toBe('CANCELLED');
    expect(firstCommit).not.toHaveBeenCalled();
  });
});
