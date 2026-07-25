import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PickedPdfFileSource } from '@/adapters/file/FileAdapter';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import {
  admitDonorPdfFiles,
  assertAdmittedDonorSetDispatchAllowed,
  DONOR_AGGREGATE_POLICY_AUTHORITY,
  getDonorPdfAdmissionPolicy,
  inspectAdmittedDonorPdfs,
} from './donorPdf';

function createSource(
  bytes: Uint8Array,
  overrides: Partial<Pick<File, 'name' | 'type' | 'size'>> = {},
): PickedPdfFileSource & { file: File & { arrayBuffer: ReturnType<typeof vi.fn> } } {
  const arrayBuffer = vi.fn(async () => bytes.slice().buffer);
  const file = {
    name: overrides.name ?? 'donor.pdf',
    type: overrides.type ?? 'application/pdf',
    size: overrides.size ?? bytes.byteLength,
    arrayBuffer,
  } as unknown as File & { arrayBuffer: ReturnType<typeof vi.fn> };
  return { file };
}

function pdfBytes(label = 'fixture'): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n${label}`);
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('donor PDF admission', () => {
  it('preserves the existing per-file source policy and unresolved aggregate authority', () => {
    const policy = getDonorPdfAdmissionPolicy();

    expect(policy.authority).toEqual({
      kind: 'EXISTING_SOURCE_POLICY',
      sourceId: 'FileAdapter.MAX_PDF_SIZE_BYTES',
    });
    expect(policy.limits.SOURCE_BYTES).toBe(FileAdapter.MAX_PDF_SIZE_BYTES);
    expect(DONOR_AGGREGATE_POLICY_AUTHORITY.kind).toBe('UNRESOLVED_POLICY');
    expect(policy.limits.AGGREGATE_SOURCE_BYTES).toBeUndefined();
  });

  it('rejects an over-limit donor before reading any selected file', async () => {
    const first = createSource(pdfBytes('first'));
    const oversized = createSource(pdfBytes('large'), {
      name: 'large.pdf',
      size: FileAdapter.MAX_PDF_SIZE_BYTES + 1,
    });

    const result = await admitDonorPdfFiles(
      [first, oversized],
      'TOOLBAR_ORGANIZE',
      'MERGE_PDF',
      { ownerDocumentKey: 'doc-1' },
    );

    expect(result.outcome).toBe('REJECTED_POLICY_LIMIT');
    expect(first.file.arrayBuffer).not.toHaveBeenCalled();
    expect(oversized.file.arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects incompatible metadata before reading any selected file', async () => {
    const valid = createSource(pdfBytes('valid'));
    const invalid = createSource(pdfBytes('invalid'), {
      name: 'notes.txt',
      type: 'text/plain',
    });

    const result = await admitDonorPdfFiles(
      [valid, invalid],
      'TOOLBAR_ORGANIZE',
      'MERGE_PDF',
      { ownerDocumentKey: 'doc-1' },
    );

    expect(result.outcome).toBe('REJECTED_INVALID_FORMAT');
    expect(valid.file.arrayBuffer).not.toHaveBeenCalled();
    expect(invalid.file.arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects a missing PDF signature before page parsing', async () => {
    const source = createSource(new TextEncoder().encode('not a PDF'));
    const countPages = vi.spyOn(PdfEditAdapter, 'countPages');

    const result = await admitDonorPdfFiles(
      [source],
      'TOOLBAR_ORGANIZE',
      'INSERT_PAGES',
      { ownerDocumentKey: 'doc-1' },
    );

    expect(result.outcome).toBe('REJECTED_INVALID_FORMAT');
    expect(countPages).not.toHaveBeenCalled();
  });

  it('rejects malformed and zero-page donors', async () => {
    const malformed = createSource(pdfBytes('malformed'), { name: 'malformed.pdf' });
    vi.spyOn(PdfEditAdapter, 'countPages').mockRejectedValueOnce(new Error('broken xref'));

    const malformedResult = await admitDonorPdfFiles(
      [malformed],
      'TOOLBAR_ORGANIZE',
      'INSERT_PAGES',
      { ownerDocumentKey: 'doc-1' },
    );
    expect(malformedResult.outcome).toBe('REJECTED_INVALID_FORMAT');

    const zeroPage = createSource(pdfBytes('zero'), { name: 'zero.pdf' });
    vi.spyOn(PdfEditAdapter, 'countPages').mockResolvedValueOnce(0);
    const zeroResult = await admitDonorPdfFiles(
      [zeroPage],
      'TOOLBAR_ORGANIZE',
      'REPLACE_PAGE',
      { ownerDocumentKey: 'doc-1' },
    );
    expect(zeroResult.outcome).toBe('REJECTED_INVALID_FORMAT');
  });

  it('admits all merge donors in picker order and measures aggregate bytes', async () => {
    const first = createSource(pdfBytes('first'), { name: 'first.pdf' });
    const second = createSource(pdfBytes('second'), { name: 'second.pdf' });
    vi.spyOn(PdfEditAdapter, 'countPages')
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(4);

    const result = await admitDonorPdfFiles(
      [first, second],
      'TOOLBAR_ORGANIZE',
      'MERGE_PDF',
      { ownerDocumentKey: 'doc-1' },
    );

    expect(result.outcome).toBe('ACCEPTED');
    if (result.outcome !== 'ACCEPTED') return;

    expect(result.value.donors.map((donor) => donor.fileName)).toEqual([
      'first.pdf',
      'second.pdf',
    ]);
    expect(result.value.donors.map((donor) => donor.pageCount)).toEqual([2, 4]);
    expect(result.evidence.aggregateSourceBytes).toBe(
      first.file.size + second.file.size,
    );
    expect(result.evidence.measurements.at(-1)).toEqual({
      metric: 'PDF_PAGE_COUNT',
      actual: 4,
      unit: 'count',
      inputIndex: 1,
      fileName: 'second.pdf',
    });
    expect(result.evidence.inputs.map((input) => input.inputIndex)).toEqual([0, 1]);
    expect(inspectAdmittedDonorPdfs(
      'MERGE_PDF',
      result.value.donors,
      'doc-1',
    ).map((donor) => donor.fileName)).toEqual(['first.pdf', 'second.pdf']);
  });

  it('returns deterministic diagnostics in input order when a later donor fails', async () => {
    const first = createSource(pdfBytes('first'), {
      name: 'first.bin',
      type: 'application/pdf',
    });
    const second = createSource(new TextEncoder().encode('bad'), {
      name: 'second.pdf',
    });
    vi.spyOn(PdfEditAdapter, 'countPages').mockResolvedValueOnce(1);

    const result = await admitDonorPdfFiles(
      [first, second],
      'TOOLBAR_ORGANIZE',
      'MERGE_PDF',
      { ownerDocumentKey: 'doc-1' },
    );

    expect(result.outcome).toBe('REJECTED_INVALID_FORMAT');
    expect(result.evidence.diagnostics.map((item) => item.inputIndex)).toEqual([0, 1]);
    expect(result.evidence.inputs.map((input) => input.inputIndex)).toEqual([0, 1]);
  });

  it('cancels during donor N and never stages a donor set', async () => {
    const controller = new AbortController();
    const first = createSource(pdfBytes('first'), { name: 'first.pdf' });
    const second = createSource(pdfBytes('second'), { name: 'second.pdf' });
    vi.spyOn(PdfEditAdapter, 'countPages')
      .mockResolvedValueOnce(1)
      .mockImplementationOnce(async () => {
        controller.abort('cancelled');
        return 1;
      });

    const result = await admitDonorPdfFiles(
      [first, second],
      'TOOLBAR_ORGANIZE',
      'MERGE_PDF',
      {
        ownerDocumentKey: 'doc-1',
        signal: controller.signal,
      },
    );

    expect(result.outcome).toBe('CANCELLED');
    expect(result.evidence.diagnostics.some(
      (item) => item.code === 'ADMISSION_CANCELLED',
    )).toBe(true);
  });

  it('suppresses a late result after a newer donor operation starts', async () => {
    const first = createSource(pdfBytes('first'), { name: 'first.pdf' });
    const second = createSource(pdfBytes('second'), { name: 'second.pdf' });
    const firstCount = createDeferred<number>();
    const countPages = vi.spyOn(PdfEditAdapter, 'countPages')
      .mockImplementationOnce(() => firstCount.promise)
      .mockResolvedValueOnce(2);

    const firstResultPromise = admitDonorPdfFiles(
      [first],
      'TOOLBAR_ORGANIZE',
      'INSERT_PAGES',
      { ownerDocumentKey: 'doc-1' },
    );
    await vi.waitFor(() => {
      expect(countPages).toHaveBeenCalledTimes(1);
    });
    const secondResult = await admitDonorPdfFiles(
      [second],
      'TOOLBAR_ORGANIZE',
      'INSERT_PAGES',
      { ownerDocumentKey: 'doc-1' },
    );
    firstCount.resolve(1);
    const firstResult = await firstResultPromise;

    expect(secondResult.outcome).toBe('ACCEPTED');
    expect(firstResult.outcome).toBe('CANCELLED');
  });

  it('rejects dispatch after the owning document context changes', async () => {
    const source = createSource(pdfBytes());
    vi.spyOn(PdfEditAdapter, 'countPages').mockResolvedValue(1);
    const result = await admitDonorPdfFiles(
      [source],
      'TOOLBAR_ORGANIZE',
      'REPLACE_PAGE',
      { ownerDocumentKey: 'doc-1' },
    );
    expect(result.outcome).toBe('ACCEPTED');
    if (result.outcome !== 'ACCEPTED') return;

    expect(() => assertAdmittedDonorSetDispatchAllowed(result.value, {
      ownerDocumentKey: 'doc-2',
    })).toThrow(/different document context/i);
  });
});
