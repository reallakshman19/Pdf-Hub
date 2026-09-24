import {
  PDFArray,
  PDFDocument,
  PDFName,
  StandardFonts,
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
  const metricFont =
    await document.embedFont(
      StandardFonts.Helvetica,
    );
  const page =
    document.addPage([
      612,
      792,
    ]);

  const fontDictionary =
    document.context.obj({
      Type: 'Font',
      Subtype: 'Type1',
      BaseFont: 'Helvetica',
      Encoding:
        'WinAnsiEncoding',
    });
  const fontRef =
    document.context.register(
      fontDictionary,
    );
  page.node.set(
    PDFName.of('Resources'),
    document.context.obj({
      Font: {
        F1: fontRef,
      },
    }),
  );

  const background =
    options.background === false
      ? ''
      : '1 1 1 rg 0 0 612 792 re f ';
  const contentSource =
    `${background}0 0 0 rg BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET`;
  const contentRef =
    document.context.register(
      document.context.flateStream(
        contentSource,
      ),
    );

  if (options.extraContentStream) {
    const extraRef =
      document.context.register(
        document.context.flateStream(
          'q Q',
        ),
      );
    page.node.set(
      PDFName.of('Contents'),
      document.context.obj([
        contentRef,
        extraRef,
      ]),
    );
  } else {
    page.node.set(
      PDFName.of('Contents'),
      contentRef,
    );
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
          metricFont.widthOfTextAtSize(
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
