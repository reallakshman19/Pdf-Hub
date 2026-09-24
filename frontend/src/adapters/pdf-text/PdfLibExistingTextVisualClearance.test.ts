import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  buildExistingTextSpan,
  createExistingTextEditIntent,
} from '@/core/existing-text/model';
import {
  matchExistingTextSpanToContentStream,
} from '@/core/existing-text/provenanceMatcher';
import {
  readExistingTextPageContentStreams,
} from './PdfLibExistingTextContentStreams';
import {
  analyzeExistingTextVisualClearance,
} from './PdfLibExistingTextVisualClearance';

const REVISION =
  'sha256:visual-clearance-test';
const PAGE_ID =
  'stable-page-1';

async function fixture(
  options: {
    background?: boolean;
    extraContentStream?: boolean;
  } = {},
) {
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

  if (options.background !== false) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 612,
      height: 792,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });
  }

  page.drawText(
    'Hello',
    {
      x: 72,
      y: 700,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    },
  );

  const fonts =
    page.node.Resources()
      ?.lookupMaybe(
        PDFName.of('Font'),
        PDFDict,
      );
  for (
    const key
    of fonts?.keys() ?? []
  ) {
    fonts?.lookupMaybe(
      key,
      PDFDict,
    )?.set(
      PDFName.of('Encoding'),
      PDFName.of(
        'WinAnsiEncoding',
      ),
    );
  }

  if (options.extraContentStream) {
    const extraRef =
      document.context.register(
        document.context.flateStream(
          'q Q',
        ),
      );
    const contents =
      page.node.get(
        PDFName.of('Contents'),
      );
    if (contents instanceof PDFArray) {
      contents.push(extraRef);
    } else if (contents) {
      page.node.set(
        PDFName.of('Contents'),
        document.context.obj([
          contents,
          extraRef,
        ]),
      );
    } else {
      throw new Error(
        'Expected generated page contents',
      );
    }
  }

  const bytes =
    new Uint8Array(
      await document.save(),
    );
  const span =
    buildExistingTextSpan(
      {
        revisionId: REVISION,
        pageId: PAGE_ID,
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
        width:
          font.widthOfTextAtSize(
            'Hello',
            12,
          ),
        height: 12,
        fontName:
          'pdfjs-font-identity',
        direction: 'ltr',
        hasEol: false,
      },
    );
  const intent =
    createExistingTextEditIntent(
      span,
      'World',
    );
  const content =
    await readExistingTextPageContentStreams(
      bytes,
      0,
    );
  const match =
    matchExistingTextSpanToContentStream({
      span,
      content,
    });
  if (match.status !== 'matched') {
    throw new Error(
      `Expected simple text provenance: ${match.reason}`,
    );
  }

  return {
    bytes,
    span,
    intent,
    provenance:
      match.provenance,
  };
}

describe('PdfLibExistingTextVisualClearance', () => {
  it('proves revision-bound visual clearance for a simple native overflow without mutating input bytes', async () => {
    const input =
      await fixture();
    const before =
      input.bytes.slice();

    const result =
      await analyzeExistingTextVisualClearance({
        pdfBytes: input.bytes,
        currentRevisionId:
          REVISION,
        span: input.span,
        intent: input.intent,
        provenance:
          input.provenance,
      });

    expect(result).toMatchObject({
      status: 'proved',
      nativeFit: {
        status: 'overflows',
        sourceText: 'Hello',
        replacementText:
          'World',
      },
      evidence: {
        schemaVersion: 1,
        sourceRevisionId:
          REVISION,
        pageId: PAGE_ID,
        spanId:
          input.span.id,
        sourceCoverage:
          'proved',
        background: {
          kind: 'solid',
          colorHex:
            '#ffffff',
        },
        foreignPaintIntersections:
          0,
      },
      proof: {
        proofMode:
          'single-stream-solid-background-target-text-only',
        foreignPaintIntersections:
          0,
      },
    });
    expect(input.bytes)
      .toEqual(before);
  });

  it('does not produce evidence without an explicit solid background paint', async () => {
    const input =
      await fixture({
        background: false,
      });

    const result =
      await analyzeExistingTextVisualClearance({
        pdfBytes: input.bytes,
        currentRevisionId:
          REVISION,
        span: input.span,
        intent: input.intent,
        provenance:
          input.provenance,
      });

    expect(result).toMatchObject({
      status: 'unproved',
      reasons: [
        'BACKGROUND_MISSING',
      ],
      nativeFit: {
        status: 'overflows',
      },
    });
  });

  it('rejects pages with more than one decoded content stream', async () => {
    const input =
      await fixture({
        extraContentStream: true,
      });

    const result =
      await analyzeExistingTextVisualClearance({
        pdfBytes: input.bytes,
        currentRevisionId:
          REVISION,
        span: input.span,
        intent: input.intent,
        provenance:
          input.provenance,
      });

    expect(result).toMatchObject({
      status: 'unproved',
      reasons: [
        'MULTIPLE_CONTENT_STREAMS',
      ],
    });
  });

  it('rejects stale revision identity before PDF analysis', async () => {
    const input =
      await fixture();

    const result =
      await analyzeExistingTextVisualClearance({
        pdfBytes: input.bytes,
        currentRevisionId:
          'sha256:stale',
        span: input.span,
        intent: input.intent,
        provenance:
          input.provenance,
      });

    expect(result).toMatchObject({
      status: 'unproved',
      reasons: [
        'STALE_EDIT_INTENT',
      ],
    });
  });

  it('does not produce fallback evidence when the replacement already fits natively', async () => {
    const input =
      await fixture();
    const fittingIntent =
      createExistingTextEditIntent(
        input.span,
        'Hi',
      );

    const result =
      await analyzeExistingTextVisualClearance({
        pdfBytes: input.bytes,
        currentRevisionId:
          REVISION,
        span: input.span,
        intent: fittingIntent,
        provenance:
          input.provenance,
      });

    expect(result).toMatchObject({
      status: 'unproved',
      reasons: [
        'NATIVE_OVERFLOW_FIT_REQUIRED',
      ],
      nativeFit: {
        status: 'fits',
      },
    });
  });
});
