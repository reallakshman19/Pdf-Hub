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
});
