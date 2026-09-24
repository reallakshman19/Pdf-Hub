import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  buildExistingTextSpan,
  createExistingTextEditIntent,
} from './model';
import {
  assessExistingTextEditPolicy,
} from './fitPolicy';
import type {
  ExistingTextNativeFitDiagnostic,
  ExistingTextReconstructedOverlayEvidence,
} from './fitTypes';
import type {
  ExistingTextEditIntent,
  ExistingTextSpan,
} from './types';

const CONTEXT = {
  revisionId: 'sha256:fit-policy',
  pageId: 'page-a',
  pageIndex: 0,
};

function nativeSpan():
  ExistingTextSpan {
  return buildExistingTextSpan(
    CONTEXT,
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

function reconstructedSpan():
  ExistingTextSpan {
  return buildExistingTextSpan(
    CONTEXT,
    {
      sourceIndex: 1,
      text: 'Hello',
      transform: [
        12, 0, 0, 12, 72, 650,
      ],
      width: 30,
      height: 12,
      direction: 'ltr',
      hasEol: false,
    },
  );
}

function fittingDiagnostic():
  ExistingTextNativeFitDiagnostic
  & { status: 'fits' } {
  return {
    schemaVersion: 1,
    status: 'fits',
    baseFont: 'Helvetica',
    sourceText: 'Hello',
    replacementText: 'Hi',
    observedAdvancePt: 30,
    fontSizePt: 12,
    tolerancePt: 0.25,
    measuredSourceWidthPt: 27,
    measuredReplacementWidthPt: 12,
    observedToMetricScale:
      30 / 27,
    projectedReplacementAdvancePt:
      12 * 30 / 27,
    overflowPt: 0,
  };
}

function overflowDiagnostic():
  ExistingTextNativeFitDiagnostic
  & { status: 'overflows' } {
  return {
    schemaVersion: 1,
    status: 'overflows',
    baseFont: 'Helvetica',
    sourceText: 'Hello',
    replacementText: 'World',
    observedAdvancePt: 30,
    fontSizePt: 12,
    tolerancePt: 0.25,
    measuredSourceWidthPt: 27,
    measuredReplacementWidthPt: 36,
    observedToMetricScale:
      30 / 27,
    projectedReplacementAdvancePt: 40,
    overflowPt: 10,
  };
}

function evidence(
  span: ExistingTextSpan,
): ExistingTextReconstructedOverlayEvidence {
  return {
    schemaVersion: 1,
    sourceRevisionId:
      span.revisionId,
    pageId: span.pageId,
    spanId: span.id,
    sourceCoverage: 'proved',
    clearanceRectPt: {
      x: 60,
      y: 640,
      width: 100,
      height: 80,
    },
    background: {
      kind: 'solid',
      colorHex: '#ffffff',
    },
    foreignPaintIntersections: 0,
    replacementBoundsPt: {
      x: 72,
      y: 650,
      width: 40,
      height: 12,
    },
  };
}

describe('existing-text edit policy', () => {
  it('admits native replacement only with a fitting diagnostic', () => {
    const span = nativeSpan();
    const intent =
      createExistingTextEditIntent(
        span,
        'Hi',
      );

    expect(
      assessExistingTextEditPolicy({
        span,
        intent,
        nativeFit:
          fittingDiagnostic(),
      }),
    ).toMatchObject({
      mode:
        'native-replacement',
    });
  });

  it('rejects a native fit diagnostic bound to a different replacement', () => {
    const span = nativeSpan();
    const intent =
      createExistingTextEditIntent(
        span,
        'Hi',
      );
    const spoofed = {
      ...fittingDiagnostic(),
      replacementText:
        'Different',
    };

    expect(
      assessExistingTextEditPolicy({
        span,
        intent,
        nativeFit: spoofed,
      }),
    ).toMatchObject({
      mode: 'blocked',
      reasons: [
        'NATIVE_FIT_IDENTITY_MISMATCH',
      ],
    });
  });

  it('blocks native overflow when fallback evidence is absent', () => {
    const span = nativeSpan();
    const intent =
      createExistingTextEditIntent(
        span,
        'World',
      );

    expect(
      assessExistingTextEditPolicy({
        span,
        intent,
        nativeFit:
          overflowDiagnostic(),
      }),
    ).toEqual({
      mode: 'blocked',
      reasons: [
        'NATIVE_REPLACEMENT_OVERFLOW',
        'FALLBACK_EVIDENCE_MISSING',
      ],
      nativeFit:
        overflowDiagnostic(),
    });
  });

  it('allows native overflow to become only a future overlay candidate with complete evidence', () => {
    const span = nativeSpan();
    const intent =
      createExistingTextEditIntent(
        span,
        'World',
      );

    expect(
      assessExistingTextEditPolicy({
        span,
        intent,
        nativeFit:
          overflowDiagnostic(),
        fallbackEvidence:
          evidence(span),
      }),
    ).toMatchObject({
      mode:
        'future-reconstructed-overlay-candidate',
      nativeFit: {
        status: 'overflows',
      },
    });
  });

  it('allows a reconstructed source only as a future overlay candidate with complete evidence', () => {
    const span =
      reconstructedSpan();
    const intent =
      createExistingTextEditIntent(
        span,
        'World',
      );

    expect(
      assessExistingTextEditPolicy({
        span,
        intent,
        fallbackEvidence:
          evidence(span),
      }),
    ).toMatchObject({
      mode:
        'future-reconstructed-overlay-candidate',
    });
  });

  it('rejects stale fallback evidence and foreign paint', () => {
    const span =
      reconstructedSpan();
    const intent =
      createExistingTextEditIntent(
        span,
        'World',
      );
    const stale = {
      ...evidence(span),
      sourceRevisionId:
        'sha256:other',
      foreignPaintIntersections: 1,
    };

    expect(
      assessExistingTextEditPolicy({
        span,
        intent,
        fallbackEvidence: stale,
      }),
    ).toMatchObject({
      mode: 'blocked',
      reasons: expect.arrayContaining([
        'FALLBACK_EVIDENCE_STALE',
        'FALLBACK_FOREIGN_PAINT_INTERSECTION',
      ]),
    });
  });

  it('rejects replacement bounds outside the proved clearance region', () => {
    const span =
      reconstructedSpan();
    const intent =
      createExistingTextEditIntent(
        span,
        'World',
      );
    const outside = {
      ...evidence(span),
      replacementBoundsPt: {
        x: 150,
        y: 650,
        width: 40,
        height: 12,
      },
    };

    expect(
      assessExistingTextEditPolicy({
        span,
        intent,
        fallbackEvidence: outside,
      }),
    ).toMatchObject({
      mode: 'blocked',
      reasons: expect.arrayContaining([
        'FALLBACK_REPLACEMENT_OUTSIDE_CLEARANCE',
      ]),
    });
  });

  it('keeps unsupported spans explicitly blocked', () => {
    const span =
      buildExistingTextSpan(
        CONTEXT,
        {
          sourceIndex: 2,
          text: '',
          transform: [
            12, 0, 0, 12, 72, 600,
          ],
          width: 0,
          height: 12,
          fontName: 'g_d0_f1',
          direction: 'ltr',
          hasEol: false,
        },
      );
    const impossibleIntent = {
      schemaVersion: 1,
      sourceRevisionId:
        span.revisionId,
      pageId: span.pageId,
      spanId: span.id,
      sourceIndex:
        span.sourceIndex,
      expectedText: span.text,
      replacementText: 'Hi',
      sourceEditability:
        'reconstructed-candidate',
    } satisfies ExistingTextEditIntent;

    expect(
      assessExistingTextEditPolicy({
        span,
        intent: impossibleIntent,
        fallbackEvidence:
          evidence(span),
      }),
    ).toEqual({
      mode: 'blocked',
      reasons: [
        'UNSUPPORTED_SPAN',
      ],
    });
  });
});
