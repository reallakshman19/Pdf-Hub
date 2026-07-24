import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { versionedMarkerForOccurrence } from './psIsonoteIdentity';
import {
  verifyPsIsonoteOutput,
  type PsIsonoteExpectedMarker,
} from './psIsonoteVerification';

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    hashBytes: vi.fn(),
  },
}));

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => ({
  PdfRendererAdapter: {
    acquireDocument: vi.fn(),
    getPageTextItems: vi.fn(),
  },
}));

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

const expectedMarker: PsIsonoteExpectedMarker = {
  psNo: 'PS-1234.5',
  pageNumber: 1,
  mappingHash: HASH_B,
  occurrenceId: HASH_C,
};

function pageWithText(text: string) {
  return {
    cleanup: vi.fn(),
    text,
  };
}

function installDocument(pageTexts: string[], pageCount = pageTexts.length): ReturnType<typeof vi.fn> {
  const pages = pageTexts.map(pageWithText);
  const release = vi.fn().mockResolvedValue(undefined);
  vi.mocked(PdfRendererAdapter.acquireDocument).mockResolvedValue({
    doc: {
      numPages: pageCount,
      getPage: vi.fn(async (pageNumber: number) => pages[pageNumber - 1]),
    } as never,
    cacheKey: HASH_A,
    release,
  });
  vi.mocked(PdfRendererAdapter.getPageTextItems).mockImplementation(async (page: unknown) => [{
    id: 'marker',
    text: (page as { text: string }).text,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    fontSize: 1,
  }]);
  return release;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(FileAdapter.hashBytes).mockResolvedValue(HASH_A);
});

describe('verifyPsIsonoteOutput', () => {
  it('verifies an output with matching hash, page count, and exactly one marker', async () => {
    const release = installDocument([versionedMarkerForOccurrence(expectedMarker)]);

    const result = await verifyPsIsonoteOutput({
      outputBytes: new Uint8Array([1, 2, 3]),
      outputDocumentKey: HASH_A,
      expectedPageCount: 1,
      expectedMarkers: [expectedMarker],
    });

    expect(result.verified).toBe(true);
    expect(result.verifiedMarkerCount).toBe(1);
    expect(result.markerResults[0]).toMatchObject({ status: 'verified', foundCount: 1 });
    expect(result.diagnostics).toEqual([]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('fails closed when an expected marker is missing', async () => {
    installDocument(['No marker here']);

    const result = await verifyPsIsonoteOutput({
      outputBytes: new Uint8Array([1]),
      outputDocumentKey: HASH_A,
      expectedPageCount: 1,
      expectedMarkers: [expectedMarker],
    });

    expect(result.verified).toBe(false);
    expect(result.markerResults[0].status).toBe('missing');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PS_ISONOTE_MARKER_MISSING', occurrenceId: HASH_C }),
    ]));
  });

  it('rejects duplicate markers and output document-key mismatches', async () => {
    const marker = versionedMarkerForOccurrence(expectedMarker);
    installDocument([`${marker} ${marker}`]);

    const result = await verifyPsIsonoteOutput({
      outputBytes: new Uint8Array([1]),
      outputDocumentKey: HASH_B,
      expectedPageCount: 1,
      expectedMarkers: [expectedMarker],
    });

    expect(result.verified).toBe(false);
    expect(result.markerResults[0]).toMatchObject({ status: 'duplicate', foundCount: 2 });
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'PS_ISONOTE_OUTPUT_HASH_MISMATCH',
      'PS_ISONOTE_MARKER_DUPLICATE',
    ]));
  });

  it('rejects page-count changes and unreadable output PDFs', async () => {
    installDocument([versionedMarkerForOccurrence(expectedMarker)], 2);
    const pageMismatch = await verifyPsIsonoteOutput({
      outputBytes: new Uint8Array([1]),
      outputDocumentKey: HASH_A,
      expectedPageCount: 1,
      expectedMarkers: [expectedMarker],
    });
    expect(pageMismatch.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PS_ISONOTE_OUTPUT_PAGE_COUNT_MISMATCH' }),
    ]));

    vi.mocked(PdfRendererAdapter.acquireDocument).mockRejectedValueOnce(new Error('bad PDF'));
    const unreadable = await verifyPsIsonoteOutput({
      outputBytes: new Uint8Array([2]),
      outputDocumentKey: HASH_A,
      expectedPageCount: 1,
      expectedMarkers: [expectedMarker],
    });
    expect(unreadable.verified).toBe(false);
    expect(unreadable.actualPageCount).toBeNull();
    expect(unreadable.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PS_ISONOTE_OUTPUT_OPEN_FAILED' }),
    ]));
  });
});
