import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  decodePDFRawStream,
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
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
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
  x = 72,
  y = 700,
  width = 60,
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
        x,
        y,
      ],
      width,
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
  x = 72,
  y = 700,
): Promise<ExistingTextSimpleTextOperator> {
  const content =
    await readExistingTextPageContentStreams(
      pdfBytes,
      0,
    );
  const result =
    matchExistingTextSpanToContentStream({
      span: spanFor(text, x, y),
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
  x = 72,
  y = 700,
  width = 60,
) {
  const span =
    spanFor(sourceText, x, y, width);
  const intent =
    createExistingTextEditIntent(
      span,
      replacementText,
    );
  const provenance =
    await provenanceFor(
      pdfBytes,
      sourceText,
      x,
      y,
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
        'Hi',
      );

    expect(result)
      .toMatchObject({
        originalText: 'Hello',
        replacementText:
          'Hi',
        encoding: 'ascii-hex',
        baseFont: 'Helvetica',
        proof: {
          prefixBytesPreserved:
            true,
          suffixBytesPreserved:
            true,
          fit: {
            status: 'fits',
            baseFont:
              'Helvetica',
          },
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
          === 'Hi',
      ),
    ).toBe(true);
    expect(
      candidates.some(
        (candidate) =>
          candidate.decodedText
          === 'Hello',
      ),
    ).toBe(false);

    const lease =
      await PdfRendererAdapter
        .acquireDocument(
          result.pdfBytes,
        );
    try {
      const page =
        await lease.doc.getPage(1);
      try {
        const items =
          await PdfRendererAdapter
            .getPageExistingTextSourceItems(
              page,
            );
        expect(
          items.some(
            (item) =>
              item.text
              === 'Hi',
          ),
        ).toBe(true);
        expect(
          items.some(
            (item) =>
              item.text
              === 'Hello',
          ),
        ).toBe(false);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }
  });

  it('rejects native replacement that exceeds the original observed advance', async () => {
    const source =
      await generatedPdf(
        'Hello',
      );

    await expect(
      replace(
        source,
        'Hello',
        'World',
      ),
    ).rejects.toMatchObject({
      code:
        'NATIVE_REPLACEMENT_OVERFLOW',
    });
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

  it("rejects an exact current operator that is not the span's unique page-wide match", async () => {
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
      );
    const provenance =
      await provenanceFor(
        source,
        'A',
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
        'BaseFont',
      ),
      PDFName.of(
        'Symbol',
      ),
    );
    const altered =
      new Uint8Array(
        await document.save(),
      );

    const span =
      spanFor('A');
    const intent =
      createExistingTextEditIntent(
        span,
        'B',
      );
    const alteredProvenance =
      await provenanceFor(
        altered,
        'A',
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
        'Hi',
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

  it('replaces a single-string literal TJ array, preserving array syntax and surviving save/reopen', async () => {
    const source =
      await generatedTjArrayPdf(
        'Hello',
        'literal',
      );
    const originalProvenance =
      await provenanceFor(
        source,
        'Hello',
      );
    expect(originalProvenance.operator).toBe('TJ');

    const result =
      await replace(
        source,
        'Hello',
        'Hi',
      );

    expect(result)
      .toMatchObject({
        originalText: 'Hello',
        replacementText: 'Hi',
        encoding: 'ascii-literal',
        baseFont: 'Helvetica',
        proof: {
          prefixBytesPreserved: true,
          suffixBytesPreserved: true,
          fit: {
            status: 'fits',
            baseFont: 'Helvetica',
          },
        },
      });

    const reopened =
      await readExistingTextPageContentStreams(
        result.pdfBytes,
        0,
      );
    expect(
      reopened.streams[result.streamIndex]?.streamRef,
    ).toBe(originalProvenance.streamRef);

    const candidates =
      reopened.streams.flatMap(
        (stream) =>
          scanExistingTextContentStream(stream).candidates,
      );
    expect(
      candidates.some(
        (candidate) =>
          candidate.operator === 'TJ'
          && candidate.decodedText === 'Hi',
      ),
    ).toBe(true);
    expect(
      candidates.some(
        (candidate) => candidate.decodedText === 'Hello',
      ),
    ).toBe(false);

    const reopenedDoc =
      await PDFDocument.load(
        result.pdfBytes,
        { updateMetadata: false },
      );
    const streamText = Array.from(
      decodePDFRawStream(
        firstPageRawStream(reopenedDoc),
      ).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toContain('[(Hi)] TJ');

    const lease =
      await PdfRendererAdapter.acquireDocument(
        result.pdfBytes,
      );
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items =
          await PdfRendererAdapter.getPageExistingTextSourceItems(
            page,
          );
        expect(
          items.some((item) => item.text === 'Hi'),
        ).toBe(true);
        expect(
          items.some((item) => item.text === 'Hello'),
        ).toBe(false);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }
  });

  it('replaces a single-string ASCII hex TJ array, preserving hex encoding family', async () => {
    const source =
      await generatedTjArrayPdf(
        'Hello',
        'hex',
      );
    const originalProvenance =
      await provenanceFor(
        source,
        'Hello',
      );
    expect(originalProvenance.operator).toBe('TJ');
    expect(originalProvenance.encoding).toBe('ascii-hex');

    const result =
      await replace(
        source,
        'Hello',
        'Hi',
      );

    expect(result)
      .toMatchObject({
        originalText: 'Hello',
        replacementText: 'Hi',
        encoding: 'ascii-hex',
        baseFont: 'Helvetica',
      });

    const reopenedDoc =
      await PDFDocument.load(
        result.pdfBytes,
        { updateMetadata: false },
      );
    const streamText = Array.from(
      decodePDFRawStream(
        firstPageRawStream(reopenedDoc),
      ).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toContain('[<4869>] TJ');
  });

  it('rejects provenance drift if TJ arrayRange does not match', async () => {
    const source =
      await generatedTjArrayPdf(
        'Hello',
        'literal',
      );
    const originalProvenance =
      await provenanceFor(
        source,
        'Hello',
      );
    expect(originalProvenance.operator).toBe('TJ');

    if (originalProvenance.operator === 'TJ') {
      const tamperedProvenance = {
        ...originalProvenance,
        arrayRange: {
          start: originalProvenance.arrayRange.start + 1,
          end: originalProvenance.arrayRange.end,
        },
      };

      const span = spanFor('Hello');
      const intent = createExistingTextEditIntent(
        span,
        'Hi',
      );

      await expect(
        replaceSimpleExistingTextTj({
          pdfBytes: source,
          currentRevisionId: REVISION,
          span,
          intent,
          provenance: tamperedProvenance,
        }),
      ).rejects.toMatchObject({
        code: 'PROVENANCE_DRIFT',
      });
    }
  });

  it('replaces text positioned by simple Td and survives save/reopen with operands intact and PDF.js extraction', async () => {
    const source = await generatedTdPdf(
      'Hello',
      'Tj',
      'hex',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
    );
    expect(originalProvenance.operator).toBe('Tj');
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 700]);

    const result = await replace(
      source,
      'Hello',
      'Hi',
    );

    expect(result).toMatchObject({
      originalText: 'Hello',
      replacementText: 'Hi',
      encoding: 'ascii-hex',
      baseFont: 'Helvetica',
      proof: {
        prefixBytesPreserved: true,
        suffixBytesPreserved: true,
        fit: {
          status: 'fits',
          baseFont: 'Helvetica',
        },
      },
    });

    const reopenedDoc = await PDFDocument.load(result.pdfBytes, {
      updateMetadata: false,
    });
    const streamText = Array.from(
      decodePDFRawStream(firstPageRawStream(reopenedDoc)).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toContain('1 0 0 1 62 720 Tm 10 -20 Td');
    expect(streamText).toContain('<4869> Tj');

    const lease = await PdfRendererAdapter.acquireDocument(result.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'Hi')).toBe(true);
        expect(items.some((item) => item.text === 'Hello')).toBe(false);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }
  });

  it('replaces single-string TJ positioned by simple Td and survives save/reopen', async () => {
    const source = await generatedTdPdf(
      'Hello',
      'TJ',
      'literal',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
    );
    expect(originalProvenance.operator).toBe('TJ');
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 700]);

    const result = await replace(
      source,
      'Hello',
      'Hi',
    );

    expect(result).toMatchObject({
      originalText: 'Hello',
      replacementText: 'Hi',
      encoding: 'ascii-literal',
      baseFont: 'Helvetica',
      proof: {
        prefixBytesPreserved: true,
        suffixBytesPreserved: true,
      },
    });

    const reopenedDoc = await PDFDocument.load(result.pdfBytes, {
      updateMetadata: false,
    });
    const streamText = Array.from(
      decodePDFRawStream(firstPageRawStream(reopenedDoc)).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toContain('1 0 0 1 62 720 Tm 10 -20 Td');
    expect(streamText).toContain('[(Hi)] TJ');

    const lease = await PdfRendererAdapter.acquireDocument(result.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'Hi')).toBe(true);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }
  });

  it('rejects provenance drift if Td positioning offsets in content stream are altered before mutation', async () => {
    const source = await generatedTdPdf(
      'Hello',
      'Tj',
      'hex',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
    );
    expect(originalProvenance.operator).toBe('Tj');
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 700]);

    const doc = await PDFDocument.load(source, { updateMetadata: false });
    const originalStream = firstPageRawStream(doc);
    const decodedBytes = decodePDFRawStream(originalStream).decode();
    const sourceText = Array.from(decodedBytes, (byte) =>
      String.fromCharCode(byte),
    ).join('');
    const tamperedSourceText = sourceText.replace('10 -20 Td', '15 -20 Td');
    const newStream = doc.context.flateStream(tamperedSourceText);
    doc.getPage(0).node.set(
      PDFName.of('Contents'),
      doc.context.register(newStream),
    );
    const tamperedPdfBytes = new Uint8Array(await doc.save());

    const span = spanFor('Hello');
    const intent = createExistingTextEditIntent(span, 'Hi');

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: tamperedPdfBytes,
        currentRevisionId: REVISION,
        span,
        intent,
        provenance: originalProvenance,
      }),
    ).rejects.toMatchObject({
      code: 'PROVENANCE_DRIFT',
    });
  });

  it('replaces text positioned by simple TD and survives save/reopen with operands intact and PDF.js extraction', async () => {
    const source = await generatedTdPdf(
      'Hello',
      'Tj',
      'hex',
      StandardFonts.Helvetica,
      'TD',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
    );
    expect(originalProvenance.operator).toBe('Tj');
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 700]);

    const result = await replace(
      source,
      'Hello',
      'Hi',
    );

    expect(result).toMatchObject({
      originalText: 'Hello',
      replacementText: 'Hi',
      encoding: 'ascii-hex',
      baseFont: 'Helvetica',
      proof: {
        prefixBytesPreserved: true,
        suffixBytesPreserved: true,
        fit: {
          status: 'fits',
          baseFont: 'Helvetica',
        },
      },
    });

    const reopenedDoc = await PDFDocument.load(result.pdfBytes, {
      updateMetadata: false,
    });
    const streamText = Array.from(
      decodePDFRawStream(firstPageRawStream(reopenedDoc)).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toContain('1 0 0 1 62 720 Tm 10 -20 TD');
    expect(streamText).toContain('<4869> Tj');

    const lease = await PdfRendererAdapter.acquireDocument(result.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'Hi')).toBe(true);
        expect(items.some((item) => item.text === 'Hello')).toBe(false);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }
  });

  it('replaces single-string TJ positioned by simple TD and survives save/reopen', async () => {
    const source = await generatedTdPdf(
      'Hello',
      'TJ',
      'literal',
      StandardFonts.Helvetica,
      'TD',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
    );
    expect(originalProvenance.operator).toBe('TJ');
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 700]);

    const result = await replace(
      source,
      'Hello',
      'Hi',
    );

    expect(result).toMatchObject({
      originalText: 'Hello',
      replacementText: 'Hi',
      encoding: 'ascii-literal',
      baseFont: 'Helvetica',
      proof: {
        prefixBytesPreserved: true,
        suffixBytesPreserved: true,
      },
    });

    const reopenedDoc = await PDFDocument.load(result.pdfBytes, {
      updateMetadata: false,
    });
    const streamText = Array.from(
      decodePDFRawStream(firstPageRawStream(reopenedDoc)).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toContain('1 0 0 1 62 720 Tm 10 -20 TD');
    expect(streamText).toContain('[(Hi)] TJ');

    const lease = await PdfRendererAdapter.acquireDocument(result.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'Hi')).toBe(true);
        expect(items.some((item) => item.text === 'Hello')).toBe(false);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }
  });

  it('rejects provenance drift if TD positioning offsets in content stream are altered before mutation', async () => {
    const source = await generatedTdPdf(
      'Hello',
      'Tj',
      'hex',
      StandardFonts.Helvetica,
      'TD',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
    );
    expect(originalProvenance.operator).toBe('Tj');
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 700]);

    const doc = await PDFDocument.load(source, { updateMetadata: false });
    const originalStream = firstPageRawStream(doc);
    const decodedBytes = decodePDFRawStream(originalStream).decode();
    const sourceText = Array.from(decodedBytes, (byte) =>
      String.fromCharCode(byte),
    ).join('');
    const tamperedSourceText = sourceText.replace('10 -20 TD', '15 -20 TD');
    const newStream = doc.context.flateStream(tamperedSourceText);
    doc.getPage(0).node.set(
      PDFName.of('Contents'),
      doc.context.register(newStream),
    );
    const tamperedPdfBytes = new Uint8Array(await doc.save());

    const span = spanFor('Hello');
    const intent = createExistingTextEditIntent(span, 'Hi');

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: tamperedPdfBytes,
        currentRevisionId: REVISION,
        span,
        intent,
        provenance: originalProvenance,
      }),
    ).rejects.toMatchObject({
      code: 'PROVENANCE_DRIFT',
    });
  });

  it('replaces text positioned by explicit TL and T* and survives save/reopen with operands intact and PDF.js extraction', async () => {
    const source = await generatedTlTStarPdf(
      'Hello',
      'Tj',
      'hex',
      StandardFonts.Helvetica,
      'TL',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
      72,
      686,
    );
    expect(originalProvenance.operator).toBe('Tj');
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 686]);

    const result = await replace(
      source,
      'Hello',
      'Hi',
      72,
      686,
    );

    expect(result).toMatchObject({
      originalText: 'Hello',
      replacementText: 'Hi',
      encoding: 'ascii-hex',
      baseFont: 'Helvetica',
      proof: {
        prefixBytesPreserved: true,
        suffixBytesPreserved: true,
        fit: {
          status: 'fits',
          baseFont: 'Helvetica',
        },
      },
    });

    const reopenedDoc = await PDFDocument.load(result.pdfBytes, {
      updateMetadata: false,
    });
    const streamText = Array.from(
      decodePDFRawStream(firstPageRawStream(reopenedDoc)).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toContain('1 0 0 1 72 700 Tm 14 TL T*');
    expect(streamText).toContain('<4869> Tj');

    const lease = await PdfRendererAdapter.acquireDocument(result.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'Hi')).toBe(true);
        expect(items.some((item) => item.text === 'Hello')).toBe(false);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }
  });

  it('replaces single-string TJ positioned by explicit TL and T* and survives save/reopen', async () => {
    const source = await generatedTlTStarPdf(
      'Hello',
      'TJ',
      'literal',
      StandardFonts.Helvetica,
      'TL',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
      72,
      686,
    );
    expect(originalProvenance.operator).toBe('TJ');
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 686]);

    const result = await replace(
      source,
      'Hello',
      'Hi',
      72,
      686,
    );

    expect(result).toMatchObject({
      originalText: 'Hello',
      replacementText: 'Hi',
      encoding: 'ascii-literal',
      baseFont: 'Helvetica',
      proof: {
        prefixBytesPreserved: true,
        suffixBytesPreserved: true,
      },
    });

    const reopenedDoc = await PDFDocument.load(result.pdfBytes, {
      updateMetadata: false,
    });
    const streamText = Array.from(
      decodePDFRawStream(firstPageRawStream(reopenedDoc)).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toContain('1 0 0 1 72 700 Tm 14 TL T*');
    expect(streamText).toContain('[(Hi)] TJ');

    const lease = await PdfRendererAdapter.acquireDocument(result.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'Hi')).toBe(true);
        expect(items.some((item) => item.text === 'Hello')).toBe(false);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }
  });

  it('replaces text positioned by T* consuming TD-established leading and survives save/reopen', async () => {
    const source = await generatedTlTStarPdf(
      'Hello',
      'Tj',
      'hex',
      StandardFonts.Helvetica,
      'TD',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
      72,
      672,
    );
    expect(originalProvenance.operator).toBe('Tj');
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 672]);

    const result = await replace(
      source,
      'Hello',
      'Hi',
      72,
      672,
    );

    expect(result).toMatchObject({
      originalText: 'Hello',
      replacementText: 'Hi',
      encoding: 'ascii-hex',
      baseFont: 'Helvetica',
    });

    const reopenedDoc = await PDFDocument.load(result.pdfBytes, {
      updateMetadata: false,
    });
    const streamText = Array.from(
      decodePDFRawStream(firstPageRawStream(reopenedDoc)).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toContain('1 0 0 1 72 700 Tm 0 -14 TD T*');
    expect(streamText).toContain('<4869> Tj');

    const lease = await PdfRendererAdapter.acquireDocument(result.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'Hi')).toBe(true);
        expect(items.some((item) => item.text === 'Hello')).toBe(false);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }
  });

  it('rejects provenance drift if TL leading value in content stream is altered before mutation', async () => {
    const source = await generatedTlTStarPdf(
      'Hello',
      'Tj',
      'hex',
      StandardFonts.Helvetica,
      'TL',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
      72,
      686,
    );
    expect(originalProvenance.operator).toBe('Tj');
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 686]);

    const doc = await PDFDocument.load(source, { updateMetadata: false });
    const originalStream = firstPageRawStream(doc);
    const decodedBytes = decodePDFRawStream(originalStream).decode();
    const sourceText = Array.from(decodedBytes, (byte) =>
      String.fromCharCode(byte),
    ).join('');
    const tamperedSourceText = sourceText.replace('14 TL', '20 TL');
    const newStream = doc.context.flateStream(tamperedSourceText);
    doc.getPage(0).node.set(
      PDFName.of('Contents'),
      doc.context.register(newStream),
    );
    const tamperedPdfBytes = new Uint8Array(await doc.save());

    const span = spanFor('Hello', 72, 686);
    const intent = createExistingTextEditIntent(span, 'Hi');

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: tamperedPdfBytes,
        currentRevisionId: REVISION,
        span,
        intent,
        provenance: originalProvenance,
      }),
    ).rejects.toMatchObject({
      code: 'PROVENANCE_DRIFT',
    });
  });

  it('rejects provenance drift if T* is removed from content stream before mutation', async () => {
    const source = await generatedTlTStarPdf(
      'Hello',
      'Tj',
      'hex',
      StandardFonts.Helvetica,
      'TL',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
      72,
      686,
    );
    expect(originalProvenance.operator).toBe('Tj');
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 686]);

    const doc = await PDFDocument.load(source, { updateMetadata: false });
    const originalStream = firstPageRawStream(doc);
    const decodedBytes = decodePDFRawStream(originalStream).decode();
    const sourceText = Array.from(decodedBytes, (byte) =>
      String.fromCharCode(byte),
    ).join('');
    const tamperedSourceText = sourceText.replace('14 TL T*', '14 TL');
    const newStream = doc.context.flateStream(tamperedSourceText);
    doc.getPage(0).node.set(
      PDFName.of('Contents'),
      doc.context.register(newStream),
    );
    const tamperedPdfBytes = new Uint8Array(await doc.save());

    const span = spanFor('Hello', 72, 686);
    const intent = createExistingTextEditIntent(span, 'Hi');

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: tamperedPdfBytes,
        currentRevisionId: REVISION,
        span,
        intent,
        provenance: originalProvenance,
      }),
    ).rejects.toMatchObject({
      code: 'PROVENANCE_DRIFT',
    });
  });

  it('replaces text positioned with explicit Tc and Tw and survives save/reopen with operands intact and PDF.js extraction', async () => {
    const source = await generatedSpacedPdf(
      'Hello World',
      'Tj',
      0.2,
      1.5,
      'hex',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello World',
      72,
      700,
    );
    expect(originalProvenance.operator).toBe('Tj');
    expect(originalProvenance.charSpacingPt).toBeCloseTo(0.2);
    expect(originalProvenance.wordSpacingPt).toBeCloseTo(1.5);

    const result = await replace(
      source,
      'Hello World',
      'Hi All',
      72,
      700,
      120,
    );

    expect(result).toMatchObject({
      originalText: 'Hello World',
      replacementText: 'Hi All',
      encoding: 'ascii-hex',
      baseFont: 'Helvetica',
      proof: {
        prefixBytesPreserved: true,
        suffixBytesPreserved: true,
        fit: {
          status: 'fits',
          baseFont: 'Helvetica',
        },
      },
    });

    const reopenedDoc = await PDFDocument.load(result.pdfBytes, {
      updateMetadata: false,
    });
    const streamText = Array.from(
      decodePDFRawStream(firstPageRawStream(reopenedDoc)).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toContain('0.2 Tc 1.5 Tw');
    expect(streamText).toContain('<486920416C6C> Tj');

    const lease = await PdfRendererAdapter.acquireDocument(result.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'Hi All')).toBe(true);
        expect(items.some((item) => item.text === 'Hello World')).toBe(false);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }

    const rescan = await provenanceFor(result.pdfBytes, 'Hi All', 72, 700);
    expect(rescan.charSpacingPt).toBeCloseTo(0.2);
    expect(rescan.wordSpacingPt).toBeCloseTo(1.5);
  });

  it('replaces single-string TJ positioned with explicit Tc and Tw and survives save/reopen', async () => {
    const source = await generatedSpacedPdf(
      'Hello World',
      'TJ',
      0.2,
      1.5,
      'literal',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello World',
      72,
      700,
    );
    expect(originalProvenance.operator).toBe('TJ');
    expect(originalProvenance.charSpacingPt).toBeCloseTo(0.2);
    expect(originalProvenance.wordSpacingPt).toBeCloseTo(1.5);

    const result = await replace(
      source,
      'Hello World',
      'Hi All',
      72,
      700,
      120,
    );

    expect(result).toMatchObject({
      originalText: 'Hello World',
      replacementText: 'Hi All',
      encoding: 'ascii-literal',
      baseFont: 'Helvetica',
      proof: {
        prefixBytesPreserved: true,
        suffixBytesPreserved: true,
      },
    });

    const reopenedDoc = await PDFDocument.load(result.pdfBytes, {
      updateMetadata: false,
    });
    const streamText = Array.from(
      decodePDFRawStream(firstPageRawStream(reopenedDoc)).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toContain('0.2 Tc 1.5 Tw');
    expect(streamText).toContain('[(Hi All)] TJ');

    const lease = await PdfRendererAdapter.acquireDocument(result.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'Hi All')).toBe(true);
        expect(items.some((item) => item.text === 'Hello World')).toBe(false);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }
  });

  it('replaces text using single-quote operator "\'" and survives save/reopen with operands intact and PDF.js extraction', async () => {
    const source = await generatedSingleQuotePdf(
      'Hello',
      'literal',
      StandardFonts.Helvetica,
      14,
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
      72,
      686,
    );
    expect(originalProvenance.operator).toBe("'");
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 686]);

    const result = await replace(
      source,
      'Hello',
      'Hi',
      72,
      686,
    );

    expect(result).toMatchObject({
      originalText: 'Hello',
      replacementText: 'Hi',
      encoding: 'ascii-literal',
      baseFont: 'Helvetica',
      proof: {
        prefixBytesPreserved: true,
        suffixBytesPreserved: true,
      },
    });

    const reopenedDoc = await PDFDocument.load(result.pdfBytes, {
      updateMetadata: false,
    });
    const streamText = Array.from(
      decodePDFRawStream(firstPageRawStream(reopenedDoc)).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toMatch(/14\s+TL[\s\S]*\(Hi\)\s+'/);

    const lease = await PdfRendererAdapter.acquireDocument(result.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'Hi')).toBe(true);
        expect(items.some((item) => item.text === 'Hello')).toBe(false);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }

    const rescan = await provenanceFor(result.pdfBytes, 'Hi', 72, 686);
    expect(rescan.operator).toBe("'");
  });

  it('replaces text using double-quote operator \'"\' and survives save/reopen with spacing operands intact and PDF.js extraction', async () => {
    const source = await generatedDoubleQuotePdf(
      'Hello World',
      1.5,
      0.2,
      'literal',
      StandardFonts.Helvetica,
      14,
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello World',
      72,
      686,
    );
    expect(originalProvenance.operator).toBe('"');
    expect(originalProvenance.wordSpacingPt).toBeCloseTo(1.5);
    expect(originalProvenance.charSpacingPt).toBeCloseTo(0.2);
    expect(originalProvenance.textMatrix).toEqual([1, 0, 0, 1, 72, 686]);

    const result = await replace(
      source,
      'Hello World',
      'Hi All',
      72,
      686,
      120,
    );

    expect(result).toMatchObject({
      originalText: 'Hello World',
      replacementText: 'Hi All',
      encoding: 'ascii-literal',
      baseFont: 'Helvetica',
      proof: {
        prefixBytesPreserved: true,
        suffixBytesPreserved: true,
      },
    });

    const reopenedDoc = await PDFDocument.load(result.pdfBytes, {
      updateMetadata: false,
    });
    const streamText = Array.from(
      decodePDFRawStream(firstPageRawStream(reopenedDoc)).decode(),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(streamText).toMatch(/1\.5\s+0\.2\s+\(Hi All\)\s+"/);

    const lease = await PdfRendererAdapter.acquireDocument(result.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'Hi All')).toBe(true);
        expect(items.some((item) => item.text === 'Hello World')).toBe(false);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }

    const rescan = await provenanceFor(result.pdfBytes, 'Hi All', 72, 686);
    expect(rescan.operator).toBe('"');
    expect(rescan.wordSpacingPt).toBeCloseTo(1.5);
    expect(rescan.charSpacingPt).toBeCloseTo(0.2);
  });

  it('supports Tc and Tw set outside BT and preserved across text objects', async () => {
    const source = await generatedSpacedPdf(
      'Hello',
      'Tj',
      0.2,
      1.5,
      'hex',
      StandardFonts.Helvetica,
      true,
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
      72,
      700,
    );
    expect(originalProvenance.charSpacingPt).toBeCloseTo(0.2);
    expect(originalProvenance.wordSpacingPt).toBeCloseTo(1.5);

    const result = await replace(
      source,
      'Hello',
      'Hi',
      72,
      700,
    );
    expect(result.replacementText).toBe('Hi');

    const lease = await PdfRendererAdapter.acquireDocument(result.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'Hi')).toBe(true);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }
  });

  it('tracks Tc and Tw across q/Q graphics state stack', async () => {
    const source = await generatedQStackSpacedPdf('Inner', 'Outer');
    const innerProvenance = await provenanceFor(source, 'Inner', 72, 700);
    expect(innerProvenance.charSpacingPt).toBeCloseTo(0.2);
    expect(innerProvenance.wordSpacingPt).toBeCloseTo(1.5);

    const outerProvenance = await provenanceFor(source, 'Outer', 72, 650);
    expect(outerProvenance.charSpacingPt).toBeCloseTo(0);
    expect(outerProvenance.wordSpacingPt).toBeCloseTo(0);

    const innerResult = await replace(
      source,
      'Inner',
      'In',
      72,
      700,
      120,
    );
    expect(innerResult.replacementText).toBe('In');

    const outerResult = await replace(
      innerResult.pdfBytes,
      'Outer',
      'Out',
      72,
      650,
      120,
    );
    expect(outerResult.replacementText).toBe('Out');

    const lease = await PdfRendererAdapter.acquireDocument(outerResult.pdfBytes);
    try {
      const page = await lease.doc.getPage(1);
      try {
        const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
        expect(items.some((item) => item.text === 'In')).toBe(true);
        expect(items.some((item) => item.text === 'Out')).toBe(true);
      } finally {
        page.cleanup();
      }
    } finally {
      await lease.release();
    }
  });

  it('rejects provenance drift if Tc in content stream is altered before mutation', async () => {
    const source = await generatedSpacedPdf(
      'Hello World',
      'Tj',
      1.5,
      2.5,
      'hex',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello World',
      72,
      700,
    );

    const doc = await PDFDocument.load(source, { updateMetadata: false });
    const originalStream = firstPageRawStream(doc);
    const decodedBytes = decodePDFRawStream(originalStream).decode();
    const sourceText = Array.from(decodedBytes, (byte) =>
      String.fromCharCode(byte),
    ).join('');
    const tamperedSourceText = sourceText.replace('1.5 Tc', '3.0 Tc');
    const newStream = doc.context.flateStream(tamperedSourceText);
    doc.getPage(0).node.set(
      PDFName.of('Contents'),
      doc.context.register(newStream),
    );
    const tamperedPdfBytes = new Uint8Array(await doc.save());

    const span = spanFor('Hello World', 72, 700, 120);
    const intent = createExistingTextEditIntent(span, 'Hi All');

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: tamperedPdfBytes,
        currentRevisionId: REVISION,
        span,
        intent,
        provenance: originalProvenance,
      }),
    ).rejects.toMatchObject({
      code: 'PROVENANCE_DRIFT',
    });
  });

  it('rejects provenance drift if Tw in content stream is altered before mutation', async () => {
    const source = await generatedSpacedPdf(
      'Hello World',
      'Tj',
      1.5,
      2.5,
      'hex',
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello World',
      72,
      700,
    );

    const doc = await PDFDocument.load(source, { updateMetadata: false });
    const originalStream = firstPageRawStream(doc);
    const decodedBytes = decodePDFRawStream(originalStream).decode();
    const sourceText = Array.from(decodedBytes, (byte) =>
      String.fromCharCode(byte),
    ).join('');
    const tamperedSourceText = sourceText.replace('2.5 Tw', '5.0 Tw');
    const newStream = doc.context.flateStream(tamperedSourceText);
    doc.getPage(0).node.set(
      PDFName.of('Contents'),
      doc.context.register(newStream),
    );
    const tamperedPdfBytes = new Uint8Array(await doc.save());

    const span = spanFor('Hello World', 72, 700, 120);
    const intent = createExistingTextEditIntent(span, 'Hi All');

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: tamperedPdfBytes,
        currentRevisionId: REVISION,
        span,
        intent,
        provenance: originalProvenance,
      }),
    ).rejects.toMatchObject({
      code: 'PROVENANCE_DRIFT',
    });
  });

  it('rejects provenance drift if single-quote operator "\'" is altered before mutation', async () => {
    const source = await generatedSingleQuotePdf(
      'Hello',
      'literal',
      StandardFonts.Helvetica,
      14,
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello',
      72,
      686,
    );

    const doc = await PDFDocument.load(source, { updateMetadata: false });
    const originalStream = firstPageRawStream(doc);
    const decodedBytes = decodePDFRawStream(originalStream).decode();
    const sourceText = Array.from(decodedBytes, (byte) =>
      String.fromCharCode(byte),
    ).join('');
    const tamperedSourceText = sourceText.replace("(Hello) '", "(Hello) Tj");
    const newStream = doc.context.flateStream(tamperedSourceText);
    doc.getPage(0).node.set(
      PDFName.of('Contents'),
      doc.context.register(newStream),
    );
    const tamperedPdfBytes = new Uint8Array(await doc.save());

    const span = spanFor('Hello', 72, 686);
    const intent = createExistingTextEditIntent(span, 'Hi');

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: tamperedPdfBytes,
        currentRevisionId: REVISION,
        span,
        intent,
        provenance: originalProvenance,
      }),
    ).rejects.toMatchObject({
      code: 'PROVENANCE_DRIFT',
    });
  });

  it('rejects provenance drift if double-quote operator parameters are altered before mutation', async () => {
    const source = await generatedDoubleQuotePdf(
      'Hello World',
      2.5,
      1.5,
      'literal',
      StandardFonts.Helvetica,
      14,
    );
    const originalProvenance = await provenanceFor(
      source,
      'Hello World',
      72,
      686,
    );

    const doc = await PDFDocument.load(source, { updateMetadata: false });
    const originalStream = firstPageRawStream(doc);
    const decodedBytes = decodePDFRawStream(originalStream).decode();
    const sourceText = Array.from(decodedBytes, (byte) =>
      String.fromCharCode(byte),
    ).join('');
    const tamperedSourceText = sourceText.replace(
      '2.5 1.5 (Hello World) "',
      '3.5 1.5 (Hello World) "',
    );
    const newStream = doc.context.flateStream(tamperedSourceText);
    doc.getPage(0).node.set(
      PDFName.of('Contents'),
      doc.context.register(newStream),
    );
    const tamperedPdfBytes = new Uint8Array(await doc.save());

    const span = spanFor('Hello World', 72, 686, 120);
    const intent = createExistingTextEditIntent(span, 'Hi All');

    await expect(
      replaceSimpleExistingTextTj({
        pdfBytes: tamperedPdfBytes,
        currentRevisionId: REVISION,
        span,
        intent,
        provenance: originalProvenance,
      }),
    ).rejects.toMatchObject({
      code: 'PROVENANCE_DRIFT',
    });
  });
});

async function generatedTlTStarPdf(
  text: string,
  operator: 'Tj' | 'TJ' = 'Tj',
  mode: 'literal' | 'hex' = 'hex',
  fontName: string = StandardFonts.Helvetica,
  leadingSeq: 'TL' | 'TD' = 'TL',
): Promise<Uint8Array> {
  const basePdf = await generatedPdf('Hello', fontName);
  const document = await PDFDocument.load(basePdf, {
    updateMetadata: false,
  });
  const page = document.getPage(0);
  const originalStream = firstPageRawStream(document);
  const decodedBytes = decodePDFRawStream(originalStream).decode();
  const source = Array.from(decodedBytes, (byte) =>
    String.fromCharCode(byte),
  ).join('');

  const token =
    mode === 'literal'
      ? `(${text})`
      : `<${Array.from(text, (character) =>
          character.charCodeAt(0).toString(16).padStart(2, '0'),
        ).join('').toUpperCase()}>`;

  const positioning =
    leadingSeq === 'TL'
      ? '1 0 0 1 72 700 Tm 14 TL T*'
      : '1 0 0 1 72 700 Tm 0 -14 TD T*';

  let modifiedSource = source.replace(
    /1 0 0 1 72 700 Tm/,
    positioning,
  );

  if (operator === 'TJ') {
    modifiedSource = modifiedSource.replace(
      /<[0-9a-fA-F]+>\s*Tj/,
      `[${token}] TJ`,
    );
  } else {
    modifiedSource = modifiedSource.replace(
      /<[0-9a-fA-F]+>\s*Tj/,
      `${token} Tj`,
    );
  }

  const newStream = document.context.flateStream(modifiedSource);
  page.node.set(
    PDFName.of('Contents'),
    document.context.register(newStream),
  );
  return new Uint8Array(await document.save());
}

async function generatedTdPdf(
  text: string,
  operator: 'Tj' | 'TJ' = 'Tj',
  mode: 'literal' | 'hex' = 'hex',
  fontName: string = StandardFonts.Helvetica,
  positioner: 'Td' | 'TD' = 'Td',
): Promise<Uint8Array> {
  const basePdf = await generatedPdf('Hello', fontName);
  const document = await PDFDocument.load(basePdf, {
    updateMetadata: false,
  });
  const page = document.getPage(0);
  const originalStream = firstPageRawStream(document);
  const decodedBytes = decodePDFRawStream(originalStream).decode();
  const source = Array.from(decodedBytes, (byte) =>
    String.fromCharCode(byte),
  ).join('');

  const token =
    mode === 'literal'
      ? `(${text})`
      : `<${Array.from(text, (character) =>
          character.charCodeAt(0).toString(16).padStart(2, '0'),
        ).join('').toUpperCase()}>`;

  let modifiedSource = source.replace(
    /1 0 0 1 72 700 Tm/,
    `1 0 0 1 62 720 Tm 10 -20 ${positioner}`,
  );

  if (operator === 'TJ') {
    modifiedSource = modifiedSource.replace(
      /<[0-9a-fA-F]+>\s*Tj/,
      `[${token}] TJ`,
    );
  } else {
    modifiedSource = modifiedSource.replace(
      /<[0-9a-fA-F]+>\s*Tj/,
      `${token} Tj`,
    );
  }

  const newStream = document.context.flateStream(modifiedSource);
  page.node.set(
    PDFName.of('Contents'),
    document.context.register(newStream),
  );
  return new Uint8Array(await document.save());
}

async function generatedTjArrayPdf(
  text: string,
  mode: 'literal' | 'hex' = 'literal',
  fontName: string = StandardFonts.Helvetica,
): Promise<Uint8Array> {
  const basePdf = await generatedPdf('Hello', fontName);
  const document = await PDFDocument.load(basePdf, {
    updateMetadata: false,
  });
  const page = document.getPage(0);
  const originalStream = firstPageRawStream(document);
  const decodedBytes = decodePDFRawStream(originalStream).decode();
  const source = Array.from(decodedBytes, (byte) =>
    String.fromCharCode(byte),
  ).join('');

  const token =
    mode === 'literal'
      ? `(${text})`
      : `<${Array.from(text, (character) =>
          character.charCodeAt(0).toString(16).padStart(2, '0'),
        ).join('').toUpperCase()}>`;
  const modifiedSource = source.replace(
    /<[0-9a-fA-F]+>\s*Tj/,
    `[${token}] TJ`,
  );
  const newStream = document.context.flateStream(modifiedSource);
  page.node.set(
    PDFName.of('Contents'),
    document.context.register(newStream),
  );
  return new Uint8Array(await document.save());
}

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

async function generatedSpacedPdf(
  text: string,
  operator: 'Tj' | 'TJ' = 'Tj',
  charSpacing = 1.5,
  wordSpacing = 2.5,
  mode: 'literal' | 'hex' = 'hex',
  fontName: string = StandardFonts.Helvetica,
  outsideBt = false,
): Promise<Uint8Array> {
  const basePdf = await generatedPdf('Hello', fontName);
  const document = await PDFDocument.load(basePdf, {
    updateMetadata: false,
  });
  const page = document.getPage(0);
  const originalStream = firstPageRawStream(document);
  const decodedBytes = decodePDFRawStream(originalStream).decode();
  const source = Array.from(decodedBytes, (byte) =>
    String.fromCharCode(byte),
  ).join('');

  const token =
    mode === 'literal'
      ? `(${text})`
      : `<${Array.from(text, (character) =>
          character.charCodeAt(0).toString(16).padStart(2, '0'),
        ).join('').toUpperCase()}>`;

  let modifiedSource: string;
  if (outsideBt) {
    modifiedSource = source.replace(
      /BT/,
      `${charSpacing} Tc ${wordSpacing} Tw BT`,
    );
  } else {
    modifiedSource = source.replace(
      /1 0 0 1 72 700 Tm/,
      `1 0 0 1 72 700 Tm ${charSpacing} Tc ${wordSpacing} Tw`,
    );
  }

  if (operator === 'TJ') {
    modifiedSource = modifiedSource.replace(
      /<[0-9a-fA-F]+>\s*Tj/,
      `[${token}] TJ`,
    );
  } else {
    modifiedSource = modifiedSource.replace(
      /<[0-9a-fA-F]+>\s*Tj/,
      `${token} Tj`,
    );
  }

  const newStream = document.context.flateStream(modifiedSource);
  page.node.set(
    PDFName.of('Contents'),
    document.context.register(newStream),
  );
  return new Uint8Array(await document.save());
}

async function generatedSingleQuotePdf(
  text: string,
  mode: 'literal' | 'hex' = 'hex',
  fontName: string = StandardFonts.Helvetica,
  leading = 14,
): Promise<Uint8Array> {
  const basePdf = await generatedPdf('Hello', fontName);
  const document = await PDFDocument.load(basePdf, {
    updateMetadata: false,
  });
  const page = document.getPage(0);
  const originalStream = firstPageRawStream(document);
  const decodedBytes = decodePDFRawStream(originalStream).decode();
  const source = Array.from(decodedBytes, (byte) =>
    String.fromCharCode(byte),
  ).join('');

  const token =
    mode === 'literal'
      ? `(${text})`
      : `<${Array.from(text, (character) =>
          character.charCodeAt(0).toString(16).padStart(2, '0'),
        ).join('').toUpperCase()}>`;

  let modifiedSource = source.replace(
    /1 0 0 1 72 700 Tm/,
    `1 0 0 1 72 700 Tm ${leading} TL`,
  );
  modifiedSource = modifiedSource.replace(
    /<[0-9a-fA-F]+>\s*Tj/,
    `${token} '`,
  );

  const newStream = document.context.flateStream(modifiedSource);
  page.node.set(
    PDFName.of('Contents'),
    document.context.register(newStream),
  );
  return new Uint8Array(await document.save());
}

async function generatedDoubleQuotePdf(
  text: string,
  wordSpacing = 2.5,
  charSpacing = 1.5,
  mode: 'literal' | 'hex' = 'hex',
  fontName: string = StandardFonts.Helvetica,
  leading = 14,
): Promise<Uint8Array> {
  const basePdf = await generatedPdf('Hello', fontName);
  const document = await PDFDocument.load(basePdf, {
    updateMetadata: false,
  });
  const page = document.getPage(0);
  const originalStream = firstPageRawStream(document);
  const decodedBytes = decodePDFRawStream(originalStream).decode();
  const source = Array.from(decodedBytes, (byte) =>
    String.fromCharCode(byte),
  ).join('');

  const token =
    mode === 'literal'
      ? `(${text})`
      : `<${Array.from(text, (character) =>
          character.charCodeAt(0).toString(16).padStart(2, '0'),
        ).join('').toUpperCase()}>`;

  let modifiedSource = source.replace(
    /1 0 0 1 72 700 Tm/,
    `1 0 0 1 72 700 Tm ${leading} TL`,
  );
  modifiedSource = modifiedSource.replace(
    /<[0-9a-fA-F]+>\s*Tj/,
    `${wordSpacing} ${charSpacing} ${token} "`,
  );

  const newStream = document.context.flateStream(modifiedSource);
  page.node.set(
    PDFName.of('Contents'),
    document.context.register(newStream),
  );
  return new Uint8Array(await document.save());
}

async function generatedQStackSpacedPdf(
  innerText: string,
  outerText: string,
  fontName: string = StandardFonts.Helvetica,
): Promise<Uint8Array> {
  const basePdf = await generatedPdf('Hello', fontName);
  const document = await PDFDocument.load(basePdf, {
    updateMetadata: false,
  });
  const page = document.getPage(0);
  const originalStream = firstPageRawStream(document);
  const decodedBytes = decodePDFRawStream(originalStream).decode();
  const source = Array.from(decodedBytes, (byte) =>
    String.fromCharCode(byte),
  ).join('');

  const fontMatch = source.match(/\/([^\s]+)\s+12\s+Tf/);
  const fontNameInStream = fontMatch ? fontMatch[1] : 'Helvetica';

  const innerHex = `<${Array.from(innerText, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase()}>`;
  const outerHex = `<${Array.from(outerText, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase()}>`;

  const streamContent = `BT
/${fontNameInStream} 12 Tf
q
0.2 Tc 1.5 Tw
1 0 0 1 72 700 Tm
${innerHex} Tj
Q
1 0 0 1 72 650 Tm
${outerHex} Tj
ET`;

  const modifiedSource = source.replace(/BT[\s\S]*?ET/, streamContent);
  const newStream = document.context.flateStream(modifiedSource);
  page.node.set(
    PDFName.of('Contents'),
    document.context.register(newStream),
  );
  return new Uint8Array(await document.save());
}

