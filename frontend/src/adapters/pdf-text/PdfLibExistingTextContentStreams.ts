import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import type {
  ExistingTextContentStreamDiagnostic,
  ExistingTextContentStreamReadResult,
  ExistingTextDecodedContentStream,
} from '@/core/existing-text/provenanceTypes';

type PdfLibNs =
  Awaited<
    ReturnType<typeof pdfLib>
  >;
type PDFDocumentT =
  import('pdf-lib').PDFDocument;

export async function readExistingTextPageContentStreams(
  bytes: Uint8Array,
  pageIndex: number,
  signal?: AbortSignal,
): Promise<ExistingTextContentStreamReadResult> {
  assertPageIndex(pageIndex);

  throwIfAborted(
    signal,
    'load PDF for existing-text provenance',
  );
  const lib = await pdfLib();
  const document =
    await raceWithAbort(
      lib.PDFDocument.load(
        bytes,
        {
          throwOnInvalidObject:
            false,
          updateMetadata: false,
        },
      ),
      signal,
      'load PDF for existing-text provenance',
    );

  return readExistingTextPageContentStreamsFromDocument(
    document,
    pageIndex,
    lib,
    signal,
  );
}

export function readExistingTextPageContentStreamsFromDocument(
  document: PDFDocumentT,
  pageIndex: number,
  lib: PdfLibNs,
  signal?: AbortSignal,
): ExistingTextContentStreamReadResult {
  assertPageIndex(pageIndex);

  if (
    pageIndex
    >= document.getPageCount()
  ) {
    throw new Error(
      `Existing-text content-stream pageIndex ${pageIndex} is outside the PDF page range.`,
    );
  }

  const page =
    document.getPage(pageIndex);
  const rawContents =
    page.node.get(
      lib.PDFName.of(
        'Contents',
      ),
    );

  if (!rawContents) {
    return {
      pageIndex,
      complete: true,
      streams: [],
      diagnostics: [],
    };
  }

  const resolvedContents =
    rawContents
      instanceof lib.PDFRef
      ? document.context.lookup(
          rawContents,
        )
      : rawContents;

  const entries =
    resolvedContents
      instanceof lib.PDFArray
      ? resolvedContents
          .asArray()
      : [rawContents];

  const streams:
    ExistingTextDecodedContentStream[] = [];
  const diagnostics:
    ExistingTextContentStreamDiagnostic[] = [];

  for (
    let streamIndex = 0;
    streamIndex
      < entries.length;
    streamIndex += 1
  ) {
    throwIfAborted(
      signal,
      'decode existing-text content stream',
    );

    const entry =
      entries[streamIndex];
    const streamRef =
      entry instanceof lib.PDFRef
        ? entry.toString()
        : (
            entries.length === 1
            && rawContents
              instanceof lib.PDFRef
              ? rawContents.toString()
              : null
          );
    const resolved =
      entry instanceof lib.PDFRef
        ? document.context.lookup(
            entry,
          )
        : (
            entries.length === 1
            && rawContents
              instanceof lib.PDFRef
              ? resolvedContents
              : entry
          );

    if (
      !(resolved
        instanceof lib.PDFRawStream)
    ) {
      diagnostics.push({
        streamIndex,
        streamRef,
        code:
          'NON_RAW_CONTENT_STREAM',
        message:
          `Page content entry ${streamIndex} is not a decodable PDFRawStream.`,
      });
      continue;
    }

    try {
      const decoded =
        lib.decodePDFRawStream(
          resolved,
        ).decode();
      streams.push({
        streamIndex,
        streamRef,
        decodedBytes:
          Uint8Array.from(
            decoded,
          ),
      });
    } catch (error) {
      diagnostics.push({
        streamIndex,
        streamRef,
        code:
          'CONTENT_STREAM_DECODE_FAILED',
        message:
          `Failed to decode page content entry ${streamIndex}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    pageIndex,
    complete:
      diagnostics.length === 0
      && streams.length
        === entries.length,
    streams,
    diagnostics,
  };
}

function assertPageIndex(
  pageIndex: number,
): void {
  if (
    !Number.isInteger(pageIndex)
    || pageIndex < 0
  ) {
    throw new Error(
      'Existing-text content-stream pageIndex must be a non-negative integer.',
    );
  }
}
