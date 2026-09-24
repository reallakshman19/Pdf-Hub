import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  buildExistingTextPageInspection,
  buildExistingTextSpan,
  createExistingTextEditIntent,
  validateExistingTextEditIntentAgainstSpan,
} from '../model';
import type {
  ExistingTextPageContext,
  ExistingTextSourceItem,
} from '../types';

const context: ExistingTextPageContext = {
  revisionId: 'sha256:revision-a',
  pageId: 'page-stable-a',
  pageIndex: 4,
};

function sourceItem(
  overrides:
    Partial<ExistingTextSourceItem>
    = {},
): ExistingTextSourceItem {
  return {
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
    width: 30,
    height: 12,
    fontName: 'g_d0_f1',
    direction: 'ltr',
    hasEol: false,
    ...overrides,
  };
}

describe('existing PDF text model', () => {
  it('classifies simple horizontal font-identified text as a native replacement candidate', () => {
    const span =
      buildExistingTextSpan(
        context,
        sourceItem(),
      );

    expect(span).toMatchObject({
      revisionId:
        'sha256:revision-a',
      pageId: 'page-stable-a',
      pageIndex: 4,
      sourceIndex: 0,
      text: 'Hello',
      originPt: {
        x: 72,
        y: 700,
      },
      fontSizePt: 12,
      horizontalScalePt: 12,
      rotationDegrees: 0,
      skewCosine: 0,
      fontName: 'g_d0_f1',
      editability:
        'native-replacement-candidate',
      reasons: [],
    });
  });

  it('binds span identity to revision + PageId + source index rather than physical page index', () => {
    const first =
      buildExistingTextSpan(
        context,
        sourceItem(),
      );
    const moved =
      buildExistingTextSpan(
        {
          ...context,
          pageIndex: 9,
        },
        sourceItem(),
      );
    const nextRevision =
      buildExistingTextSpan(
        {
          ...context,
          revisionId:
            'sha256:revision-b',
        },
        sourceItem(),
      );

    expect(first.id)
      .toBe(moved.id);
    expect(first.id)
      .not.toBe(
        nextRevision.id,
      );
  });

  it('downgrades font-ambiguous, rotated, skewed and vertical text to reconstructed candidates', () => {
    const missingFont =
      buildExistingTextSpan(
        context,
        sourceItem({
          fontName: undefined,
        }),
      );
    expect(missingFont)
      .toMatchObject({
        editability:
          'reconstructed-candidate',
        reasons: [
          'MISSING_FONT_IDENTITY',
        ],
      });

    const complex =
      buildExistingTextSpan(
        context,
        sourceItem({
          direction: 'ttb',
          transform: [
            0,
            12,
            4,
            12,
            72,
            700,
          ],
        }),
      );
    expect(complex.editability)
      .toBe(
        'reconstructed-candidate',
      );
    expect(complex.reasons)
      .toEqual(
        expect.arrayContaining([
          'VERTICAL_WRITING_MODE',
          'ROTATED_TEXT',
          'SKEWED_TEXT',
        ]),
      );
  });

  it('fails closed for blank or malformed source geometry', () => {
    const blank =
      buildExistingTextSpan(
        context,
        sourceItem({
          text: '   ',
        }),
      );
    expect(blank)
      .toMatchObject({
        editability:
          'unsupported',
        reasons: ['EMPTY_TEXT'],
      });

    const malformed =
      buildExistingTextSpan(
        context,
        sourceItem({
          sourceIndex: -1,
          transform: [
            Number.NaN,
            0,
            0,
            12,
            72,
            700,
          ],
          width: 0,
        }),
      );
    expect(malformed.editability)
      .toBe('unsupported');
    expect(malformed.reasons)
      .toEqual(
        expect.arrayContaining([
          'INVALID_SOURCE_INDEX',
          'NON_FINITE_GEOMETRY',
          'NON_POSITIVE_ADVANCE',
        ]),
      );
  });

  it('summarizes page inspection classifications', () => {
    const inspection =
      buildExistingTextPageInspection(
        context,
        [
          sourceItem(),
          sourceItem({
            sourceIndex: 1,
            fontName: undefined,
          }),
          sourceItem({
            sourceIndex: 2,
            text: '',
          }),
        ],
      );

    expect(inspection.counts)
      .toEqual({
        nativeReplacementCandidates: 1,
        reconstructedCandidates: 1,
        unsupported: 1,
      });
  });

  it('creates revision-bound edit intents and detects stale selections', () => {
    const span =
      buildExistingTextSpan(
        context,
        sourceItem(),
      );
    const intent =
      createExistingTextEditIntent(
        span,
        'World',
      );

    expect(intent).toEqual({
      schemaVersion: 1,
      sourceRevisionId:
        'sha256:revision-a',
      pageId: 'page-stable-a',
      spanId: span.id,
      sourceIndex: 0,
      expectedText: 'Hello',
      replacementText: 'World',
      sourceEditability:
        'native-replacement-candidate',
    });
    expect(
      validateExistingTextEditIntentAgainstSpan(
        intent,
        span,
      ),
    ).toEqual({
      ok: true,
      errors: [],
    });

    const nextRevisionSpan =
      buildExistingTextSpan(
        {
          ...context,
          revisionId:
            'sha256:revision-b',
        },
        sourceItem(),
      );
    const stale =
      validateExistingTextEditIntentAgainstSpan(
        intent,
        nextRevisionSpan,
      );
    expect(stale.ok).toBe(false);
    expect(stale.errors)
      .toEqual(
        expect.arrayContaining([
          'source revision does not match the inspected span revision',
          'spanId does not match the inspected span',
        ]),
      );
  });

  it('refuses edit intents for unsupported spans but permits an empty replacement', () => {
    const supported =
      buildExistingTextSpan(
        context,
        sourceItem(),
      );
    expect(
      createExistingTextEditIntent(
        supported,
        '',
      ).replacementText,
    ).toBe('');

    const unsupported =
      buildExistingTextSpan(
        context,
        sourceItem({
          text: '',
        }),
      );
    expect(() =>
      createExistingTextEditIntent(
        unsupported,
        'replacement',
      ),
    ).toThrow(
      'Unsupported existing-text spans cannot create an edit intent.',
    );
  });
});
