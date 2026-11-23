import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  buildExistingTextSpan,
} from '@/core/existing-text/model';
import {
  analyzeExistingTextVisualClearance,
} from './PdfLibExistingTextVisualClearance';
import {
  readExistingTextPageContentStreams,
} from './PdfLibExistingTextContentStreams';
import {
  matchExistingTextSpanToContentStream,
} from '@/core/existing-text/provenanceMatcher';
import {
  evaluateExistingTextUiCapability,
} from './PdfLibExistingTextUiEvaluation';

vi.mock(
  './PdfLibExistingTextContentStreams',
  () => ({
    readExistingTextPageContentStreams:
      vi.fn(),
  }),
);

vi.mock(
  '@/core/existing-text/provenanceMatcher',
  () => ({
    matchExistingTextSpanToContentStream:
      vi.fn(),
  }),
);

vi.mock(
  './PdfLibExistingTextVisualClearance',
  () => ({
    analyzeExistingTextVisualClearance:
      vi.fn(),
  }),
);

function span() {
  return buildExistingTextSpan(
    {
      revisionId: 'doc-1',
      pageId: 'page-1',
      pageIndex: 0,
    },
    {
      sourceIndex: 0,
      text: 'Hello',
      transform: [
        12, 0, 0, 12, 72, 700,
      ],
      width: 30,
      height: 12,
      fontName: 'g_d0_f1',
      direction: 'ltr',
      hasEol: false,
    },
  );
}

const provenance = {
  streamIndex: 0,
  streamRef: '7 0 R',
  operatorIndex: 4,
  operator: 'Tj' as const,
  operatorRange: {
    start: 18,
    end: 20,
  },
  operandRange: {
    start: 10,
    end: 17,
  },
  decodedText: 'Hello',
  encoding:
    'ascii-literal' as const,
  fontResourceName: 'F1',
  fontSizePt: 12,
  textMatrix: [
    1, 0, 0, 1, 72, 700,
  ] as [
    number,
    number,
    number,
    number,
    number,
    number,
  ],
};

function fittingFit(
  replacementText = 'Hi',
) {
  return {
    schemaVersion: 1 as const,
    status: 'fits' as const,
    baseFont: 'Helvetica',
    sourceText: 'Hello',
    replacementText,
    observedAdvancePt: 30,
    fontSizePt: 12,
    tolerancePt: 0.25,
    measuredSourceWidthPt: 27,
    measuredReplacementWidthPt:
      12,
    observedToMetricScale:
      30 / 27,
    projectedReplacementAdvancePt:
      12 * 30 / 27,
    overflowPt: 0,
  };
}

function overflowFit(
  replacementText = 'World',
) {
  return {
    schemaVersion: 1 as const,
    status:
      'overflows' as const,
    baseFont: 'Helvetica',
    sourceText: 'Hello',
    replacementText,
    observedAdvancePt: 30,
    fontSizePt: 12,
    tolerancePt: 0.25,
    measuredSourceWidthPt: 27,
    measuredReplacementWidthPt:
      36,
    observedToMetricScale:
      30 / 27,
    projectedReplacementAdvancePt:
      40,
    overflowPt: 10,
  };
}

describe('PdfLibExistingTextUiEvaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      readExistingTextPageContentStreams,
    ).mockResolvedValue({
      pageIndex: 0,
      complete: true,
      streams: [],
      diagnostics: [],
    });
    vi.mocked(
      matchExistingTextSpanToContentStream,
    ).mockReturnValue({
      status: 'matched',
      spanId: span().id,
      provenance,
    });
  });

  it('reports native capability from the canonical fit analysis', async () => {
    vi.mocked(
      analyzeExistingTextVisualClearance,
    ).mockResolvedValue({
      status: 'unproved',
      reasons: [
        'NATIVE_OVERFLOW_FIT_REQUIRED',
      ],
      diagnostics: [],
      nativeFit:
        fittingFit('Hi'),
    });

    const result =
      await evaluateExistingTextUiCapability({
        pdfBytes:
          new Uint8Array([1]),
        currentRevisionId:
          'doc-1',
        span: span(),
        replacementText: 'Hi',
      });

    expect(result).toMatchObject({
      status: 'native',
      nativeFit: {
        status: 'fits',
      },
      provenance,
    });
  });

  it('reports proved fallback without converting it into native authority', async () => {
    vi.mocked(
      analyzeExistingTextVisualClearance,
    ).mockResolvedValue({
      status: 'proved',
      nativeFit:
        overflowFit('World'),
      evidence: {
        schemaVersion: 1,
        sourceRevisionId:
          'doc-1',
        pageId: 'page-1',
        spanId: span().id,
        sourceCoverage:
          'proved',
        clearanceRectPt: {
          x: 72,
          y: 697,
          width: 40,
          height: 15,
        },
        background: {
          kind: 'solid',
          colorHex:
            '#ffffff',
        },
        foreignPaintIntersections:
          0,
        replacementBoundsPt: {
          x: 72,
          y: 697,
          width: 40,
          height: 15,
        },
      },
      proof: {
        schemaVersion: 1,
        proofMode:
          'single-stream-solid-background-target-text-only',
        streamIndex: 0,
        streamRef: '7 0 R',
        targetOperatorIndex: 4,
        operatorCount: 4,
        backgroundPaintOperatorIndex:
          1,
        backgroundRectPt: {
          x: 0,
          y: 0,
          width: 612,
          height: 792,
        },
        backgroundColorHex:
          '#ffffff',
        targetTextColorHex:
          '#000000',
        sourceBoundsPt: {
          x: 72,
          y: 697,
          width: 30,
          height: 15,
        },
        replacementBoundsPt: {
          x: 72,
          y: 697,
          width: 40,
          height: 15,
        },
        clearanceRectPt: {
          x: 72,
          y: 697,
          width: 40,
          height: 15,
        },
        foreignPaintIntersections:
          0,
      },
    });

    const result =
      await evaluateExistingTextUiCapability({
        pdfBytes:
          new Uint8Array([1]),
        currentRevisionId:
          'doc-1',
        span: span(),
        replacementText:
          'World',
      });

    expect(result).toMatchObject({
      status:
        'fallback-proved',
      nativeFit: {
        status: 'overflows',
      },
    });
  });

  it('reports missing subset glyphs when replacement contains unsupported characters', async () => {
    vi.mocked(
      analyzeExistingTextVisualClearance,
    ).mockResolvedValue({
      status: 'unproved',
      reasons: ['FONT_RESOURCE_UNSUPPORTED'],
      diagnostics: [],
      nativeFit: {
        schemaVersion: 1,
        status: 'unmeasurable',
        reason: 'MISSING_SUBSET_GLYPHS',
        missingCharacters: ['Ω'],
        baseFont: 'TestSubsetFont',
        sourceText: 'Hello',
        replacementText: 'Ω',
        observedAdvancePt: 30,
        fontSizePt: 12,
        tolerancePt: 0.25,
      },
    });

    const result =
      await evaluateExistingTextUiCapability({
        pdfBytes:
          new Uint8Array([1]),
        currentRevisionId:
          'doc-1',
        span: span(),
        replacementText: 'Ω',
      });

    expect(result.status)
      .toBe('unavailable');
    if ('reasons' in result) {
      expect(result.reasons[0])
        .toContain('The font subset does not contain characters: Ω');
    } else {
      expect.fail('Expected unavailable status');
    }
  });

  it('reports unavailable when exact current provenance cannot be rematched', async () => {
    vi.mocked(
      matchExistingTextSpanToContentStream,
    ).mockReturnValue({
      status: 'unmapped',
      spanId: span().id,
      reason:
        'NO_SIMPLE_TEXT_OPERATOR_MATCH',
      candidateCount: 0,
      diagnostics: [
        'no exact operator',
      ],
    });

    const result =
      await evaluateExistingTextUiCapability({
        pdfBytes:
          new Uint8Array([1]),
        currentRevisionId:
          'doc-1',
        span: span(),
        replacementText: 'Hi',
      });

    expect(result).toMatchObject({
      status: 'unavailable',
    });
    expect(
      analyzeExistingTextVisualClearance,
    ).not.toHaveBeenCalled();
  });
});
