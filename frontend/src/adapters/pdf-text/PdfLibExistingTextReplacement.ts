import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import {
  scanExistingTextContentStream,
} from '@/core/existing-text/contentStreamScanner';
import {
  validateExistingTextEditIntentAgainstSpan,
} from '@/core/existing-text/model';
import {
  matchExistingTextSpanToContentStream,
} from '@/core/existing-text/provenanceMatcher';
import {
  encodeSimpleExistingTextReplacementOperand,
} from '@/core/existing-text/replacementOperand';
import {
  ExistingTextReplacementError,
} from '@/core/existing-text/replacementError';
import type {
  ExistingTextSimpleReplacementInput,
  ExistingTextSimpleReplacementMutationInput,
  ExistingTextSimpleReplacementMutationResult,
  ExistingTextSimpleReplacementResult,
} from '@/core/existing-text/replacementTypes';
import type {
  ExistingTextSimpleTextOperator,
} from '@/core/existing-text/provenanceTypes';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  readExistingTextPageContentStreamsFromDocument,
} from './PdfLibExistingTextContentStreams';
import {
  measureExistingTextNativeFit,
} from './PdfLibExistingTextFit';
import {
  resolveExistingTextStandard14BaseFont,
} from './PdfLibExistingTextFont';

type PdfLibNs =
  Awaited<
    ReturnType<typeof pdfLib>
  >;
type PDFDocumentT =
  import('pdf-lib').PDFDocument;
type PDFPageT =
  import('pdf-lib').PDFPage;
type PDFRawStreamT =
  import('pdf-lib').PDFRawStream;
type PDFRefT =
  import('pdf-lib').PDFRef;
type PDFArrayT =
  import('pdf-lib').PDFArray;
type PDFObjectT =
  import('pdf-lib').PDFObject;

interface LocatedContentStream {
  page: PDFPageT;
  resolvedContents:
    PDFObjectT;
  targetStream:
    PDFRawStreamT;
  targetRef:
    PDFRefT | null;
  containerRef:
    PDFRefT | null;
  streamIndex: number;
  topology:
    ExistingTextSimpleReplacementResult[
      'proof'
    ]['contentTopology'];
}

const STALE_STREAM_DICT_KEYS =
  new Set([
    'Length',
    'Filter',
    'DecodeParms',
    'DL',
  ]);

export async function replaceSimpleExistingTextTj(
  input:
    ExistingTextSimpleReplacementInput,
): Promise<ExistingTextSimpleReplacementResult> {
  validateWriteBoundary(input);

  throwIfAborted(
    input.signal,
    'load PDF for simple existing-text replacement',
  );
  const lib = await pdfLib();
  const document =
    await raceWithAbort(
      lib.PDFDocument.load(
        input.pdfBytes,
        {
          throwOnInvalidObject:
            false,
          updateMetadata: false,
        },
      ),
      input.signal,
      'load PDF for simple existing-text replacement',
    );

  const mutation =
    await applySimpleExistingTextReplacementToDocument(
      document,
      lib,
      input,
    );

  throwIfAborted(
    input.signal,
    'save simple existing-text replacement',
  );
  const saved =
    await raceWithAbort(
      document.save(),
      input.signal,
      'save simple existing-text replacement',
    );

  return {
    ...mutation,
    pdfBytes:
      new Uint8Array(saved),
  };
}

export async function applySimpleExistingTextReplacementToDocument(
  document: PDFDocumentT,
  lib: PdfLibNs,
  input:
    ExistingTextSimpleReplacementMutationInput,
): Promise<ExistingTextSimpleReplacementMutationResult> {
  validateWriteBoundary(input);

  const currentContent =
    readExistingTextPageContentStreamsFromDocument(
      document,
      input.span.pageIndex,
      lib,
      input.signal,
    );
  const currentMatch =
    matchExistingTextSpanToContentStream({
      span: input.span,
      content: currentContent,
    });
  if (
    currentMatch.status
      !== 'matched'
    || !sameProvenance(
      currentMatch.provenance,
      input.provenance,
    )
  ) {
    throw provenanceDrift(
      currentMatch.status === 'unmapped'
        ? `The current page no longer uniquely maps the inspected span: ${currentMatch.reason}.`
        : 'The current page provenance no longer matches the supplied operator.',
      currentMatch.status === 'unmapped'
        ? currentMatch.diagnostics
        : undefined,
    );
  }

  const pageIndex =
    input.span.pageIndex;
  if (
    pageIndex
    >= document.getPageCount()
  ) {
    throw provenanceDrift(
      'The inspected page index is no longer present in the current PDF.',
    );
  }

  const located =
    locateContentStream(
      document,
      document.getPage(pageIndex),
      input.provenance,
      lib,
    );

  rejectSharedTopology(
    document,
    located,
    lib,
  );

  const baseFont =
    resolveExistingTextStandard14BaseFont(
      located.page,
      input.provenance
        .fontResourceName,
      lib,
    );

  throwIfAborted(
    input.signal,
    'decode target content stream for existing-text replacement',
  );
  const originalDecoded =
    decodeRawStream(
      located.targetStream,
      lib,
    );
  assertProvenanceStillMatches(
    originalDecoded,
    input.provenance,
    located.targetRef
      ?.toString()
      ?? null,
  );

  const replacementOperand =
    encodeSimpleExistingTextReplacementOperand(
      input.provenance.encoding,
      input.intent
        .replacementText,
    );
  const fit =
    await measureExistingTextNativeFit(
      {
        baseFont,
        sourceText:
          input.intent.expectedText,
        replacementText:
          input.intent.replacementText,
        observedAdvancePt:
          input.span.advanceWidthPt,
        fontSizePt:
          input.provenance.fontSizePt,
        signal: input.signal,
      },
      lib,
    );

  if (fit.status === 'unmeasurable') {
    throw new ExistingTextReplacementError(
      'NATIVE_FIT_UNMEASURABLE',
      'The native replacement fit cannot be proven for the current text span.',
      [
        `fit-reason=${fit.reason}`,
      ],
    );
  }
  if (fit.status === 'overflows') {
    throw new ExistingTextReplacementError(
      'NATIVE_REPLACEMENT_OVERFLOW',
      'The replacement text exceeds the original observed text advance and cannot be safely replaced natively.',
      [
        `observed-advance-pt=${fit.observedAdvancePt}`,
        `projected-replacement-advance-pt=${fit.projectedReplacementAdvancePt}`,
        `tolerance-pt=${fit.tolerancePt}`,
      ],
    );
  }
  const rewrittenDecoded =
    replaceByteRange(
      originalDecoded,
      input.provenance
        .operandRange.start,
      input.provenance
        .operandRange.end,
      replacementOperand,
    );

  const rewrittenStream =
    document.context.flateStream(
      rewrittenDecoded,
    );
  copyPassiveStreamEntries(
    located.targetStream,
    rewrittenStream,
  );
  installRewrittenStream(
    document,
    located,
    rewrittenStream,
    lib,
  );

  const replacementStart =
    input.provenance
      .operandRange.start;
  const replacementEnd =
    replacementStart
    + replacementOperand.length;

  return {
    pageIndex,
    streamIndex:
      input.provenance
        .streamIndex,
    streamRef:
      input.provenance
        .streamRef,
    originalText:
      input.intent.expectedText,
    replacementText:
      input.intent
        .replacementText,
    encoding:
      input.provenance
        .encoding,
    fontResourceName:
      input.provenance
        .fontResourceName,
    baseFont,
    proof: {
      originalOperandRange: {
        ...input.provenance
          .operandRange,
      },
      replacementOperandRange: {
        start:
          replacementStart,
        end: replacementEnd,
      },
      originalDecodedLength:
        originalDecoded.length,
      rewrittenDecodedLength:
        rewrittenDecoded.length,
      prefixBytesPreserved:
        byteRangesEqual(
          originalDecoded,
          0,
          input.provenance
            .operandRange.start,
          rewrittenDecoded,
          0,
          replacementStart,
        ),
      suffixBytesPreserved:
        byteRangesEqual(
          originalDecoded,
          input.provenance
            .operandRange.end,
          originalDecoded.length,
          rewrittenDecoded,
          replacementEnd,
          rewrittenDecoded.length,
        ),
      contentTopology:
        located.topology,
      targetStreamIndirect:
        located.targetRef
        !== null,
      fit,
    },
  };
}

function validateWriteBoundary(
  input:
    ExistingTextSimpleReplacementMutationInput,
): void {
  if (
    input.currentRevisionId
    !== input.intent
      .sourceRevisionId
  ) {
    throw new ExistingTextReplacementError(
      'STALE_EXISTING_TEXT_INTENT',
      'The active revision no longer matches the existing-text edit intent.',
    );
  }

  if (
    input.span.editability
    !== 'native-replacement-candidate'
  ) {
    throw new ExistingTextReplacementError(
      'SPAN_NOT_NATIVE_REPLACEMENT_CANDIDATE',
      'Only native-replacement-candidate spans can enter the simple native writer.',
    );
  }

  const intentValidation =
    validateExistingTextEditIntentAgainstSpan(
      input.intent,
      input.span,
    );
  if (!intentValidation.ok) {
    throw new ExistingTextReplacementError(
      'STALE_EXISTING_TEXT_INTENT',
      'The existing-text edit intent no longer matches the inspected span.',
      intentValidation.errors,
    );
  }

  if (
    input.provenance
      .decodedText
    !== input.intent
      .expectedText
    || input.provenance
      .streamIndex < 0
  ) {
    throw provenanceDrift(
      'The supplied content-stream provenance does not match the edit intent.',
    );
  }
}

function locateContentStream(
  document: PDFDocumentT,
  page: PDFPageT,
  provenance:
    ExistingTextSimpleTextOperator,
  lib: PdfLibNs,
): LocatedContentStream {
  const contentsName =
    lib.PDFName.of(
      'Contents',
    );
  const rawContents =
    page.node.get(
      contentsName,
    );

  if (!rawContents) {
    throw contentStreamNotFound(
      'The target page has no /Contents entry.',
    );
  }

  const resolvedContents =
    rawContents
      instanceof lib.PDFRef
      ? document.context.lookup(
          rawContents,
        )
      : rawContents;

  if (!resolvedContents) {
    throw contentStreamNotFound(
      'The target page /Contents entry cannot be resolved.',
    );
  }

  if (
    resolvedContents
      instanceof lib.PDFArray
  ) {
    const targetEntry =
      resolvedContents.get(
        provenance.streamIndex,
      );
    if (!targetEntry) {
      throw contentStreamNotFound(
        'The provenance stream index is no longer present in the page content array.',
      );
    }

    const targetRef =
      targetEntry
        instanceof lib.PDFRef
        ? targetEntry
        : null;
    const target =
      targetRef
        ? document.context.lookup(
            targetRef,
          )
        : targetEntry;

    if (
      !(target
        instanceof lib.PDFRawStream)
    ) {
      throw contentStreamNotFound(
        'The provenance content-array entry is no longer a raw stream.',
      );
    }

    assertStreamRef(
      provenance.streamRef,
      targetRef,
    );

    return {
      page,
      resolvedContents,
      targetStream: target,
      targetRef,
      containerRef:
        rawContents
          instanceof lib.PDFRef
          ? rawContents
          : null,
      streamIndex:
        provenance.streamIndex,
      topology:
        rawContents
          instanceof lib.PDFRef
          ? 'array-indirect'
          : 'array-direct',
    };
  }

  if (
    provenance.streamIndex
    !== 0
    || !(
      resolvedContents
      instanceof lib.PDFRawStream
    )
  ) {
    throw contentStreamNotFound(
      'The provenance expects a content stream that no longer matches the page /Contents topology.',
    );
  }

  const targetRef =
    rawContents
      instanceof lib.PDFRef
      ? rawContents
      : null;
  assertStreamRef(
    provenance.streamRef,
    targetRef,
  );

  return {
    page,
    resolvedContents,
    targetStream:
      resolvedContents,
    targetRef,
    containerRef: null,
    streamIndex: 0,
    topology:
      targetRef
        ? 'single-indirect'
        : 'single-direct',
  };
}

function assertStreamRef(
  expected: string | null,
  actual: PDFRefT | null,
): void {
  const actualText =
    actual?.toString()
    ?? null;
  if (expected !== actualText) {
    throw provenanceDrift(
      'The target content-stream reference no longer matches the provenance record.',
    );
  }
}

function rejectSharedTopology(
  document: PDFDocumentT,
  located:
    LocatedContentStream,
  lib: PdfLibNs,
): void {
  if (
    located.containerRef
    && countPageContentsRefUsage(
      document,
      located.containerRef,
      lib,
    ) > 1
  ) {
    throw new ExistingTextReplacementError(
      'SHARED_CONTENT_CONTAINER_REF',
      'The page /Contents array is shared by multiple pages and cannot be mutated in place.',
    );
  }

  if (
    located.targetRef
    && countContentStreamRefUsage(
      document,
      located.targetRef,
      lib,
    ) > 1
  ) {
    throw new ExistingTextReplacementError(
      'SHARED_CONTENT_STREAM_REF',
      'The target content stream is shared by multiple page content entries and cannot be mutated in place.',
    );
  }
}

function countPageContentsRefUsage(
  document: PDFDocumentT,
  ref: PDFRefT,
  lib: PdfLibNs,
): number {
  const name =
    lib.PDFName.of(
      'Contents',
    );
  const refText =
    ref.toString();
  let count = 0;

  for (
    const page
    of document.getPages()
  ) {
    const raw =
      page.node.get(name);
    if (
      raw instanceof lib.PDFRef
      && raw.toString()
        === refText
    ) {
      count += 1;
    }
  }

  return count;
}

function countContentStreamRefUsage(
  document: PDFDocumentT,
  ref: PDFRefT,
  lib: PdfLibNs,
): number {
  const name =
    lib.PDFName.of(
      'Contents',
    );
  const refText =
    ref.toString();
  let count = 0;

  for (
    const page
    of document.getPages()
  ) {
    const raw =
      page.node.get(name);
    if (!raw) continue;

    if (
      raw instanceof lib.PDFRef
    ) {
      const resolved =
        document.context.lookup(
          raw,
        );
      if (
        resolved
          instanceof lib.PDFRawStream
        && raw.toString()
          === refText
      ) {
        count += 1;
        continue;
      }
      if (
        resolved
          instanceof lib.PDFArray
      ) {
        count +=
          countRefInArray(
            resolved,
            refText,
            lib,
          );
      }
      continue;
    }

    if (
      raw instanceof lib.PDFArray
    ) {
      count +=
        countRefInArray(
          raw,
          refText,
          lib,
        );
    }
  }

  return count;
}

function countRefInArray(
  array: PDFArrayT,
  refText: string,
  lib: PdfLibNs,
): number {
  let count = 0;
  for (
    let index = 0;
    index < array.size();
    index += 1
  ) {
    const entry =
      array.get(index);
    if (
      entry instanceof lib.PDFRef
      && entry.toString()
        === refText
    ) {
      count += 1;
    }
  }
  return count;
}

function decodeRawStream(
  stream: PDFRawStreamT,
  lib: PdfLibNs,
): Uint8Array {
  try {
    return Uint8Array.from(
      lib.decodePDFRawStream(
        stream,
      ).decode(),
    );
  } catch (error) {
    throw provenanceDrift(
      `The target content stream can no longer be decoded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertProvenanceStillMatches(
  decodedBytes: Uint8Array,
  provenance:
    ExistingTextSimpleTextOperator,
  streamRef: string | null,
): void {
  const scan =
    scanExistingTextContentStream({
      streamIndex:
        provenance.streamIndex,
      streamRef,
      decodedBytes,
    });

  if (!scan.complete) {
    throw provenanceDrift(
      'The target content stream no longer fits the simple provenance syntax.',
      scan.diagnostics,
    );
  }

  const matches =
    scan.candidates.filter(
      (candidate) =>
        sameProvenance(
          candidate,
          provenance,
        ),
    );

  if (matches.length !== 1) {
    throw provenanceDrift(
      'The exact simple text operator described by the provenance record no longer exists.',
    );
  }
}

function sameProvenance(
  current:
    ExistingTextSimpleTextOperator,
  expected:
    ExistingTextSimpleTextOperator,
): boolean {
  if (current.operator !== expected.operator) {
    return false;
  }

  if (current.operator === 'TJ' && expected.operator === 'TJ') {
    if (
      current.arrayRange.start !== expected.arrayRange.start
      || current.arrayRange.end !== expected.arrayRange.end
    ) {
      return false;
    }
  }

  return (
    current.streamIndex
      === expected.streamIndex
    && current.streamRef
      === expected.streamRef
    && current.operatorIndex
      === expected.operatorIndex
    && current.operatorRange.start
      === expected.operatorRange.start
    && current.operatorRange.end
      === expected.operatorRange.end
    && current.operandRange.start
      === expected.operandRange.start
    && current.operandRange.end
      === expected.operandRange.end
    && current.decodedText
      === expected.decodedText
    && current.encoding
      === expected.encoding
    && current.fontResourceName
      === expected.fontResourceName
    && current.fontSizePt
      === expected.fontSizePt
    && current.textMatrix.every(
      (value, index) =>
        value
        === expected
          .textMatrix[index],
    )
  );
}

function replaceByteRange(
  source: Uint8Array,
  start: number,
  end: number,
  replacement: Uint8Array,
): Uint8Array {
  if (
    !Number.isInteger(start)
    || !Number.isInteger(end)
    || start < 0
    || end < start
    || end > source.length
  ) {
    throw provenanceDrift(
      'The provenance operand byte range is outside the decoded content stream.',
    );
  }

  const output =
    new Uint8Array(
      source.length
      - (end - start)
      + replacement.length,
    );
  output.set(
    source.subarray(0, start),
    0,
  );
  output.set(
    replacement,
    start,
  );
  output.set(
    source.subarray(end),
    start + replacement.length,
  );
  return output;
}

function copyPassiveStreamEntries(
  source: PDFRawStreamT,
  target: PDFRawStreamT,
): void {
  for (
    const key
    of source.dict.keys()
  ) {
    const name =
      key.decodeText();
    if (
      STALE_STREAM_DICT_KEYS
        .has(name)
    ) {
      continue;
    }

    const value =
      source.dict.get(key);
    if (value) {
      target.dict.set(
        key,
        value,
      );
    }
  }
}

function installRewrittenStream(
  document: PDFDocumentT,
  located:
    LocatedContentStream,
  rewritten:
    PDFRawStreamT,
  lib: PdfLibNs,
): void {
  if (located.targetRef) {
    document.context.assign(
      located.targetRef,
      rewritten,
    );
    return;
  }

  if (
    located.resolvedContents
      instanceof lib.PDFArray
  ) {
    located.resolvedContents.set(
      located.streamIndex,
      rewritten,
    );
    return;
  }

  located.page.node.set(
    lib.PDFName.of(
      'Contents',
    ),
    rewritten,
  );
}

function byteRangesEqual(
  left: Uint8Array,
  leftStart: number,
  leftEnd: number,
  right: Uint8Array,
  rightStart: number,
  rightEnd: number,
): boolean {
  if (
    leftEnd - leftStart
    !== rightEnd - rightStart
  ) {
    return false;
  }

  for (
    let index = 0;
    index
      < leftEnd - leftStart;
    index += 1
  ) {
    if (
      left[
        leftStart + index
      ]
      !== right[
        rightStart + index
      ]
    ) {
      return false;
    }
  }

  return true;
}

function contentStreamNotFound(
  message: string,
): ExistingTextReplacementError {
  return new ExistingTextReplacementError(
    'CONTENT_STREAM_NOT_FOUND',
    message,
  );
}

function provenanceDrift(
  message: string,
  details?: readonly string[],
): ExistingTextReplacementError {
  return new ExistingTextReplacementError(
    'PROVENANCE_DRIFT',
    message,
    details,
  );
}
