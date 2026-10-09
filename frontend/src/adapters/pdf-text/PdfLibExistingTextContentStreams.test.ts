import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  PDFDocument,
  StandardFonts,
} from 'pdf-lib';
import {
  buildExistingTextSpan,
} from '@/core/existing-text/model';
import {
  matchExistingTextSpanToContentStream,
} from '@/core/existing-text/provenanceMatcher';
import {
  scanExistingTextContentStream,
} from '@/core/existing-text/contentStreamScanner';
import {
  readExistingTextPageContentStreams,
} from './PdfLibExistingTextContentStreams';

describe('pdf-lib existing-text content stream reader', () => {
  it('decodes a generated simple page stream and exposes a matchable Tj operator', async () => {
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

    const bytes =
      new Uint8Array(
        await document.save(),
      );
    const content =
      await readExistingTextPageContentStreams(
        bytes,
        0,
      );

    expect(content.complete)
      .toBe(true);
    expect(content.streams.length)
      .toBeGreaterThan(0);

    const candidates =
      content.streams.flatMap(
        (stream) =>
          scanExistingTextContentStream(
            stream,
          ).candidates,
      );
    expect(
      candidates.some(
        (candidate) =>
          candidate.decodedText
          === 'Hello',
      ),
    ).toBe(true);

    const span =
      buildExistingTextSpan(
        {
          revisionId:
            'sha256:test',
          pageId: 'page-a',
          pageIndex: 0,
        },
        {
          sourceIndex: 0,
          text: 'Hello',
          transform: [
            12,
            0,
            0,
            12,
            72,
            700,
          ],
          width: 27.336,
          height: 12,
          fontName:
            'pdfjs-font-identity',
          direction: 'ltr',
          hasEol: false,
        },
      );

    expect(
      matchExistingTextSpanToContentStream({
        span,
        content,
      }),
    ).toMatchObject({
      status: 'matched',
      provenance: {
        decodedText: 'Hello',
        fontSizePt: 12,
      },
    });
  });
});
