import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  measureExistingTextNativeFit,
} from './PdfLibExistingTextFit';

describe('existing-text native fit metrics', () => {
  it('accepts a shorter Helvetica replacement and preserves observed scale', async () => {
    const result =
      await measureExistingTextNativeFit({
        baseFont: 'Helvetica',
        sourceText: 'Hello',
        replacementText: 'Hi',
        observedAdvancePt: 60,
        fontSizePt: 12,
      });

    expect(result.status)
      .toBe('fits');
    if (result.status === 'unmeasurable') {
      throw new Error(
        'Expected measurable fit',
      );
    }
    expect(
      result.observedToMetricScale,
    ).toBeGreaterThan(1);
    expect(
      result.projectedReplacementAdvancePt,
    ).toBeLessThan(
      result.observedAdvancePt,
    );
    expect(result.overflowPt)
      .toBe(0);
  });

  it('rejects a wider Helvetica replacement against the observed source advance', async () => {
    const result =
      await measureExistingTextNativeFit({
        baseFont: 'Helvetica',
        sourceText: 'Hello',
        replacementText: 'World',
        observedAdvancePt: 30,
        fontSizePt: 12,
      });

    expect(result.status)
      .toBe('overflows');
    if (result.status !== 'overflows') {
      throw new Error(
        'Expected measurable overflow',
      );
    }
    expect(
      result.projectedReplacementAdvancePt,
    ).toBeGreaterThan(
      result.observedAdvancePt
      + result.tolerancePt,
    );
    expect(result.overflowPt)
      .toBeGreaterThan(0);
  });

  it('fails closed before loading font metrics when observed advance is invalid', async () => {
    await expect(
      measureExistingTextNativeFit({
        baseFont: 'Helvetica',
        sourceText: 'Hello',
        replacementText: 'Hi',
        observedAdvancePt: 0,
        fontSizePt: 12,
      }),
    ).resolves.toMatchObject({
      status: 'unmeasurable',
      reason:
        'INVALID_OBSERVED_ADVANCE',
    });
  });

  it('computes spacing-aware widths with positive Tc when character count differs', async () => {
    const zeroSpacing = await measureExistingTextNativeFit({
      baseFont: 'Helvetica',
      sourceText: 'Hello',
      replacementText: 'Hi',
      observedAdvancePt: 35,
      fontSizePt: 12,
      charSpacingPt: 0,
      wordSpacingPt: 0,
    });

    const positiveTc = await measureExistingTextNativeFit({
      baseFont: 'Helvetica',
      sourceText: 'Hello',
      replacementText: 'Hi',
      observedAdvancePt: 35 + (5 * 2), // observed advance includes 5 * 2 = 10 pt
      fontSizePt: 12,
      charSpacingPt: 2,
      wordSpacingPt: 0,
    });

    expect(positiveTc.status).toBe('fits');
    if (positiveTc.status !== 'fits' || zeroSpacing.status !== 'fits') {
      throw new Error('Expected fits');
    }
    // Hello has 5 chars -> +10 pt; Hi has 2 chars -> +4 pt
    expect(positiveTc.measuredSourceWidthPt).toBeCloseTo(zeroSpacing.measuredSourceWidthPt + 10, 4);
    expect(positiveTc.measuredReplacementWidthPt).toBeCloseTo(zeroSpacing.measuredReplacementWidthPt + 4, 4);
  });

  it('computes spacing-aware widths with positive Tw when ASCII-space count differs', async () => {
    const zeroSpacing = await measureExistingTextNativeFit({
      baseFont: 'Helvetica',
      sourceText: 'A B C',
      replacementText: 'ABC',
      observedAdvancePt: 35,
      fontSizePt: 12,
      charSpacingPt: 0,
      wordSpacingPt: 0,
    });

    const positiveTw = await measureExistingTextNativeFit({
      baseFont: 'Helvetica',
      sourceText: 'A B C',
      replacementText: 'ABC',
      observedAdvancePt: 35 + (2 * 4), // 2 spaces * 4 = 8 pt
      fontSizePt: 12,
      charSpacingPt: 0,
      wordSpacingPt: 4,
    });

    expect(positiveTw.status).toBe('fits');
    if (positiveTw.status !== 'fits' || zeroSpacing.status !== 'fits') {
      throw new Error('Expected fits');
    }
    // 'A B C' has 2 spaces -> +8 pt; 'ABC' has 0 spaces -> +0 pt
    expect(positiveTw.measuredSourceWidthPt).toBeCloseTo(zeroSpacing.measuredSourceWidthPt + 8, 4);
    expect(positiveTw.measuredReplacementWidthPt).toBeCloseTo(zeroSpacing.measuredReplacementWidthPt, 4);
  });

  it('handles negative Tc tightening tracking and differing character counts', async () => {
    const zeroSpacing = await measureExistingTextNativeFit({
      baseFont: 'Helvetica',
      sourceText: 'Hello World',
      replacementText: 'Hello',
      observedAdvancePt: 60,
      fontSizePt: 12,
      charSpacingPt: 0,
      wordSpacingPt: 0,
    });

    const negativeTc = await measureExistingTextNativeFit({
      baseFont: 'Helvetica',
      sourceText: 'Hello World',
      replacementText: 'Hello',
      observedAdvancePt: 60 - (11 * 0.5),
      fontSizePt: 12,
      charSpacingPt: -0.5,
      wordSpacingPt: 0,
    });

    expect(negativeTc.status).toBe('fits');
    if (negativeTc.status !== 'fits' || zeroSpacing.status !== 'fits') {
      throw new Error('Expected fits');
    }
    expect(negativeTc.measuredSourceWidthPt).toBeCloseTo(zeroSpacing.measuredSourceWidthPt - 5.5, 4);
    expect(negativeTc.measuredReplacementWidthPt).toBeCloseTo(zeroSpacing.measuredReplacementWidthPt - 2.5, 4);
  });

  it('handles negative Tw where valid and space count differs', async () => {
    const zeroSpacing = await measureExistingTextNativeFit({
      baseFont: 'Helvetica',
      sourceText: 'One Two Three',
      replacementText: 'One',
      observedAdvancePt: 70,
      fontSizePt: 12,
      charSpacingPt: 0,
      wordSpacingPt: 0,
    });

    const negativeTw = await measureExistingTextNativeFit({
      baseFont: 'Helvetica',
      sourceText: 'One Two Three',
      replacementText: 'One',
      observedAdvancePt: 70 - (2 * 1),
      fontSizePt: 12,
      charSpacingPt: 0,
      wordSpacingPt: -1,
    });

    expect(negativeTw.status).toBe('fits');
    if (negativeTw.status !== 'fits' || zeroSpacing.status !== 'fits') {
      throw new Error('Expected fits');
    }
    // 2 spaces * -1 = -2 pt
    expect(negativeTw.measuredSourceWidthPt).toBeCloseTo(zeroSpacing.measuredSourceWidthPt - 2, 4);
    expect(negativeTw.measuredReplacementWidthPt).toBeCloseTo(zeroSpacing.measuredReplacementWidthPt, 4);
  });
});
