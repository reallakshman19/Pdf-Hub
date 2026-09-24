import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  StandardFonts,
} from 'pdf-lib';
import type {
  PDFObject,
} from 'pdf-lib';
import {
  buildExistingTextSpan,
  createExistingTextEditIntent,
} from '@/core/existing-text/model';
import {
  matchExistingTextSpanToContentStream,
} from '@/core/existing-text/provenanceMatcher';
import {
  scanExistingTextContentStream,
} from '@/core/existing-text/contentStreamScanner';
import {
  encodeSimpleExistingTextReplacementOperand,
} from '@/core/existing-text/replacementOperand';
import type {
  ExistingTextSimpleTextOperator,
} from '@/core/existing-text/provenanceTypes';
import {
  readExistingTextPageContentStreams,
} from './PdfLibExistingTextContentStreams';
import {
  replaceSimpleExistingTextTj,
} from './PdfLibExistingTextReplacement';

const REVISION =
  'sha256:phase13-revision';

async function generatedPdf(
  text: string,
  fontName: string
    = StandardFonts.Helvetica,
): Promise<Uint8Array> {
  const document =
    await PDFDocument.create();
  const font =
    await document.embedFont(
      fontName,
    );
  const page =
    document.addPage([
      612,
      792,
    ]);
  page.drawText(
    text,
    {
      x: 72,
      y: 700,
      size: 12,
      font,
    },
  );
  return new Uint8Array(
    await document.save(),
  );
}

function spanFor(
  text: string,
) {
  return buildExistingTextSpan(
    {
      revisionId:
        REVISION,
      pageId: 'page-a',
      pageIndex: 0,
    },
    {
      sourceIndex: 0,
      text,
      transform: [
        12,
        0,
        0,
        12,
        72,
        700,
      ],
      width: 30,
      height: 12,
      fontName:
        'pdfjs-font-identity',
      direction: 'ltr',
      hasEol: false,
    },
  );
}

async function provenanceFor(
  pdfBytes: Uint8Array,
  text: string,
): Promise<ExistingTextSimpleTextOperator> {
  const content =
    await readExistingTextPageContentStreams(
      pdfBytes,
      0,
    );
  const result =
    matchExistingTextSpanToContentStream({
      span: spanFor(text),
      content,
    });
  if (result.status !== 'matched') {
    throw new Error(
      `Expected matched provenance, got ${result.reason}`,
    );
  }
  return result.provenance;
}

async function replace(
  pdfBytes: Uint8Array,
  sourceText: string,
  replacementText: string,
) {
  const span =
    spanFor(sourceText);
  const intent =
    createExistingTextEditIntent(
      span,
      replacementText,
    );
  const provenance =
    await provenanceFor(
      pdfBytes,
      sourceText,
    );

  return replaceSimpleExistingTextTj({
    pdfBytes,
    currentRevisionId:
      REVISION,
    span,
    intent,
    provenance,
  });
}

describe('simple existing-text native replacement', () => {
  it('replaces a unique WinAnsi Standard-14 hex Tj and survives save/reopen', async () => {
    const source =
      await generatedPdf(
        'Hello',
      );
    const originalProvenance =
      await provenanceFor(
        source,
        'Hello',
      );
    const result =
      await replace(
        source,
        'Hello',
        'World',
      );

    expect(result)
      .toMatchObject({
        originalText: 'Hello',
        replacementText:
          'World',
        encoding: 'ascii-hex',
        baseFont: 'Helvetica',
        proof: {
          prefixBytesPreserved:
            true,
          suffixBytesPreserved:
            true,
        },
      });

    const reopened =
      await readExistingTextPageContentStreams(
        result.pdfBytes,
        0,
      );
    expect(
      reopened.streams[
        result.streamIndex
      ]?.streamRef,
    ).toBe(
      originalProvenance
        .streamRef,
    );

    const candidates =
      reopened.streams.flatMap(
        (stream) =>
          scanExistingTextContentStream(
            stream,
          ).candidates,
      );

    expect(
      candidates.some(
        (candidate) =>
          candidate.decodedText
          === 'World',
      ),
    ).toBe(true);
    expect(
      candidates.some(
        (candidate) =>
          candidate.decodedText
          === 'Hello',
      ),
    ).toBe(false);
  });

  it('preserves literal representation and escapes parentheses/backslashes', () => {
    const encoded =
      encodeSimpleExistingTextReplacementOperand(
        'ascii-literal',
        'A(B)\\C',
      );
    expect(
      String.fromCharCode(
        ...encoded,
      ),
    ).toBe(
      '(A\\(B\\)\\\\C)',
    );
  });

  it('preserves hex representation family', () => {
    const encoded =
      encodeSimpleExistingTextReplacementOperand(
        'ascii-hex',
        'World',
      );
    expect(
      String.fromCharCode(
        ...encoded,
      ),
    ).toBe(
      '<576F726C64>',
    );
  });

  it('rejects stale revision intent before reading PDF bytes', async () => {
    const span =
      spanFor('Hello');
    const intent =
      createExistingTextEditIntent(
        span,
        'World',
      );

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes:
          new Uint8Array([
            1,
            2,
            3,
          ]),
        currentRevisionId:
          'sha256:new-revision',
        span,
        intent,
        provenance: {
          streamIndex: 0,
          streamRef: null,
          operatorIndex: 1,
          operator: 'Tj',
          operatorRange: {
            start: 0,
            end: 2,
          },
          operandRange: {
            start: 0,
            end: 0,
          },
          decodedText: 'Hello',
          encoding:
            'ascii-literal',
          fontResourceName:
            'F1',
          fontSizePt: 12,
          textMatrix: [
            1,
            0,
            0,
            1,
            72,
            700,
          ],
        },
      }),
    ).rejects.toMatchObject({
      code:
        'STALE_EXISTING_TEXT_INTENT',
    });
  });

  it('rejects non-ASCII replacement text', async () => {
    const source =
      await generatedPdf(
        'Hello',
      );
    const span =
      spanFor('Hello');
    const intent =
      createExistingTextEditIntent(
        span,
        'Ω',
      );
    const provenance =
      await provenanceFor(
        source,
        'Hello',
      );

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: source,
        currentRevisionId:
          REVISION,
        span,
        intent,
        provenance,
      }),
    ).rejects.toMatchObject({
      code:
        'UNSUPPORTED_REPLACEMENT_TEXT',
    });
  });

  it('rejects an exact current operator that is not the span\'s unique page-wide match', async () => {
    const document =
      await PDFDocument.create();
    const font =
      await document.embedFont(
        StandardFonts.Helvetica,
      );
    const page =
      document.addPage([
        612,
        792,
      ]);
    page.drawText(
      'Hello',
      {
        x: 72,
        y: 700,
        size: 12,
        font,
      },
    );
    page.drawText(
      'Hello',
      {
        x: 72,
        y: 650,
        size: 12,
        font,
      },
    );
    const source =
      new Uint8Array(
        await document.save(),
      );
    const content =
      await readExistingTextPageContentStreams(
        source,
        0,
      );
    const candidates =
      content.streams.flatMap(
        (stream) =>
          scanExistingTextContentStream(
            stream,
          ).candidates,
      );
    const wrong =
      candidates.find(
        (candidate) =>
          candidate.decodedText
            === 'Hello'
          && candidate.textMatrix[5]
            === 650,
      );
    if (!wrong) {
      throw new Error(
        'Expected second Hello candidate',
      );
    }

    const span =
      spanFor('Hello');
    const intent =
      createExistingTextEditIntent(
        span,
        'World',
      );

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: source,
        currentRevisionId:
          REVISION,
        span,
        intent,
        provenance: wrong,
      }),
    ).rejects.toMatchObject({
      code:
        'PROVENANCE_DRIFT',
    });
  });

  it('rejects provenance drift before rewriting', async () => {
    const source =
      await generatedPdf(
        'Hello',
      );
    const span =
      spanFor('Hello');
    const intent =
      createExistingTextEditIntent(
        span,
        'World',
      );
    const provenance =
      await provenanceFor(
        source,
        'Hello',
      );

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: source,
        currentRevisionId:
          REVISION,
        span,
        intent,
        provenance: {
          ...provenance,
          operandRange: {
            start:
              provenance
                .operandRange
                .start + 1,
            end:
              provenance
                .operandRange
                .end,
          },
        },
      }),
    ).rejects.toMatchObject({
      code:
        'PROVENANCE_DRIFT',
    });
  });

  it('rejects Symbol font resources', async () => {
    const source =
      await generatedPdf(
        'A',
        StandardFonts.Symbol,
      );
    const span =
      spanFor('A');
    const intent =
      createExistingTextEditIntent(
        span,
        'B',
      );
    const provenance =
      await provenanceFor(
        source,
        'A',
      );

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: source,
        currentRevisionId:
          REVISION,
        span,
        intent,
        provenance,
      }),
    ).rejects.toMatchObject({
      code:
        'UNSUPPORTED_FONT_RESOURCE',
    });
  });

  it('rejects non-WinAnsi font encoding', async () => {
    const source =
      await generatedPdf(
        'Hello',
      );
    const provenance =
      await provenanceFor(
        source,
        'Hello',
      );
    const document =
      await PDFDocument.load(
        source,
        {
          updateMetadata: false,
        },
      );
    const font =
      resolveFontDict(
        document,
        provenance
          .fontResourceName,
      );
    font.set(
      PDFName.of(
        'Encoding',
      ),
      PDFName.of(
        'MacRomanEncoding',
      ),
    );
    const altered =
      new Uint8Array(
        await document.save(),
      );

    const span =
      spanFor('Hello');
    const intent =
      createExistingTextEditIntent(
        span,
        'World',
      );
    const alteredProvenance =
      await provenanceFor(
        altered,
        'Hello',
      );

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: altered,
        currentRevisionId:
          REVISION,
        span,
        intent,
        provenance:
          alteredProvenance,
      }),
    ).rejects.toMatchObject({
      code:
        'UNSUPPORTED_FONT_ENCODING',
    });
  });

  it('preserves passive target stream dictionary entries', async () => {
    const source =
      await generatedPdf(
        'Hello',
      );
    const document =
      await PDFDocument.load(
        source,
        {
          updateMetadata: false,
        },
      );
    const stream =
      firstPageRawStream(
        document,
      );
    stream.dict.set(
      PDFName.of(
        'Phase13Keep',
      ),
      PDFName.of(
        'Preserved',
      ),
    );

    const withPassiveEntry =
      new Uint8Array(
        await document.save(),
      );
    const result =
      await replace(
        withPassiveEntry,
        'Hello',
        'World',
      );

    const reopened =
      await PDFDocument.load(
        result.pdfBytes,
        {
          updateMetadata: false,
        },
      );
    const reopenedStream =
      firstPageRawStream(
        reopened,
      );

    expect(
      reopenedStream.dict
        .lookup(
          PDFName.of(
            'Phase13Keep',
          ),
          PDFName,
        )
        .decodeText(),
    ).toBe('Preserved');
  });

  it('rejects shared indirect content-stream references', async () => {
    const source =
      await generatedPdf(
        'Hello',
      );
    const document =
      await PDFDocument.load(
        source,
        {
          updateMetadata: false,
        },
      );
    const firstPage =
      document.getPage(0);
    const contentsName =
      PDFName.of(
        'Contents',
      );
    const sharedStreamRef =
      ensureFirstContentStreamRef(
        document,
        firstPage.node.get(
          contentsName,
        ),
      );

    const secondPage =
      document.addPage([
        612,
        792,
      ]);
    secondPage.node.set(
      contentsName,
      sharedStreamRef,
    );

    const sharedBytes =
      new Uint8Array(
        await document.save(),
      );
    const span =
      spanFor('Hello');
    const intent =
      createExistingTextEditIntent(
        span,
        'World',
      );
    const provenance =
      await provenanceFor(
        sharedBytes,
        'Hello',
      );

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes:
          sharedBytes,
        currentRevisionId:
          REVISION,
        span,
        intent,
        provenance,
      }),
    ).rejects.toMatchObject({
      code:
        'SHARED_CONTENT_STREAM_REF',
    });
  });
});

function resolveFontDict(
  document: PDFDocument,
  resourceName: string,
): PDFDict {
  const resources =
    document
      .getPage(0)
      .node.Resources();
  const fonts =
    resources?.lookupMaybe(
      PDFName.of('Font'),
      PDFDict,
    );
  const font =
    fonts?.lookupMaybe(
      PDFName.of(
        resourceName,
      ),
      PDFDict,
    );
  if (!font) {
    throw new Error(
      'Expected font resource',
    );
  }
  return font;
}

function firstPageRawStream(
  document: PDFDocument,
): PDFRawStream {
  return resolveFirstRawStream(
    document,
    document
      .getPage(0)
      .node.get(
        PDFName.of(
          'Contents',
        ),
      ),
  );
}

function resolveFirstRawStream(
  document: PDFDocument,
  raw:
    PDFObject | undefined,
): PDFRawStream {
  if (!raw) {
    throw new Error(
      'Missing page contents',
    );
  }
  const resolved =
    raw instanceof PDFRef
      ? document.context.lookup(
          raw,
        )
      : raw;

  if (
    resolved
      instanceof PDFRawStream
  ) {
    return resolved;
  }

  if (
    resolved
      instanceof PDFArray
  ) {
    const first =
      resolved.get(0);
    if (!first) {
      throw new Error(
        'Empty content array',
      );
    }
    const stream =
      first instanceof PDFRef
        ? document.context.lookup(
            first,
          )
        : first;
    if (
      stream
        instanceof PDFRawStream
    ) {
      return stream;
    }
  }

  throw new Error(
    'Expected a raw page content stream',
  );
}

function ensureFirstContentStreamRef(
  document: PDFDocument,
  raw:
    PDFObject | undefined,
): PDFRef {
  if (!raw) {
    throw new Error(
      'Missing page contents',
    );
  }
  const page =
    document.getPage(0);
  const contentsName =
    PDFName.of(
      'Contents',
    );
  const resolved =
    raw instanceof PDFRef
      ? document.context.lookup(
          raw,
        )
      : raw;

  if (
    resolved
      instanceof PDFRawStream
  ) {
    if (raw instanceof PDFRef) {
      return raw;
    }
    const ref =
      document.context.register(
        resolved,
      );
    page.node.set(
      contentsName,
      ref,
    );
    return ref;
  }

  if (
    resolved
      instanceof PDFArray
  ) {
    const first =
      resolved.get(0);
    if (!first) {
      throw new Error(
        'Empty content array',
      );
    }
    if (
      first instanceof PDFRef
    ) {
      return first;
    }
    if (
      !(
        first
        instanceof PDFRawStream
      )
    ) {
      throw new Error(
        'Expected raw stream array entry',
      );
    }
    const ref =
      document.context.register(
        first,
      );
    resolved.set(0, ref);
    return ref;
  }

  throw new Error(
    'Expected raw page content stream',
  );
}
