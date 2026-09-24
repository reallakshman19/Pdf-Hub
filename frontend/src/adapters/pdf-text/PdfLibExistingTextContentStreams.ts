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

export async function readExistingTextPageContentStreams(
  bytes: Uint8Array,
  pageIndex: number,
  signal?: AbortSignal,
): Promise<ExistingTextContentStreamReadResult> {
  if (
    !Number.isInteger(pageIndex)
    || pageIndex < 0
  ) {
    throw new Error(
      'Existing-text content-stream pageIndex must be a non-negative integer.',
    );
  }

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
        },
      ),
      signal,
      'load PDF for existing-text provenance',
    );

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
  const entries =
    page.node
      .normalizedEntries();
  const contents =
    entries.Contents;

  if (!contents) {
    return {
      pageIndex,
      complete: true,
      streams: [],
      diagnostics: [],
    };
  }

  const streams:
    ExistingTextDecodedContentStream[] = [];
  const diagnostics:
    ExistingTextContentStreamDiagnostic[] = [];

  for (
    let streamIndex = 0;
    streamIndex
      < contents.size();
    streamIndex += 1
  ) {
    throwIfAborted(
      signal,
      'decode existing-text content stream',
    );

    const entry =
      contents.get(
        streamIndex,
      );
    const streamRef =
      entry instanceof lib.PDFRef
        ? entry.toString()
        : null;
    const resolved =
      entry instanceof lib.PDFRef
        ? document.context.lookup(
            entry,
          )
        : entry;

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
          new Uint8Array(
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
        === contents.size(),
    streams,
    diagnostics,
  };
}
