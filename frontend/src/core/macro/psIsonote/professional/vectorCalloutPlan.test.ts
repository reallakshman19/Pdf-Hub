import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE,
  type PsIsonotePlannedCallout,
  type TextMetricsProvider,
} from './model';
import { wrapTextByMetrics } from './typography';
import { buildPsIsonoteVectorRenderPlan } from './vectorCalloutPlan';

const metrics: TextMetricsProvider = {
  widthOfText: (text, fontSize, weight) =>
    text.length * fontSize * (weight === 'bold' ? 0.58 : 0.52),
};

function callout(overrides: Partial<PsIsonotePlannedCallout> = {}): PsIsonotePlannedCallout {
  return {
    psNo: 'PS-11167.4',
    pageNumber: 1,
    mappingHash: `sha256:${'a'.repeat(64)}`,
    occurrenceId: `sha256:${'b'.repeat(64)}`,
    content: {
      psNo: 'PS-11167.4',
      family: 'R+G',
      isonote: 'REST, GUIDE',
    },
    box: { x: 300, y: 120, width: 180, height: 48 },
    anchor: { x: 250, y: 180 },
    leader: {
      points: [
        { x: 300, y: 144 },
        { x: 275, y: 144 },
        { x: 275, y: 180 },
        { x: 250, y: 180 },
      ],
      anchorRadius: 2.5,
    },
    quality: 'clean',
    diagnostics: [],
    score: 10,
    styleVersion: DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE.styleVersion,
    ...overrides,
  };
}

describe('professional PS ISONOTE vector core', () => {
  it('wraps visible text using supplied font metrics', () => {
    const lines = wrapTextByMetrics({
      text: 'REST GUIDE WITH LONG GAP REQUIREMENT',
      maximumWidth: 62,
      fontSize: 8,
      metrics,
    });

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.width <= 62)).toBe(true);
    expect(lines.map((line) => line.text).join(' ')).toBe('REST GUIDE WITH LONG GAP REQUIREMENT');
  });

  it('produces only auditable vector primitives and visible text', () => {
    const plan = buildPsIsonoteVectorRenderPlan({ callout: callout(), metrics });

    expect(plan.pageNumber).toBe(1);
    expect(plan.styleVersion).toBe('professional-v1');
    expect(plan.primitives.some((primitive) => primitive.type === 'rectangle')).toBe(true);
    expect(plan.primitives.some((primitive) => primitive.type === 'circle')).toBe(true);
    expect(plan.primitives.filter((primitive) => primitive.type === 'line')).toHaveLength(3);
    expect(plan.primitives.some((primitive) => primitive.type === 'text')).toBe(true);
    expect(plan.visibleText).toContain('PS-11167.4');
    expect(plan.visibleText).toContain('REST, GUIDE');
  });

  it('uses warning styling only for review-required callouts', () => {
    const plan = buildPsIsonoteVectorRenderPlan({
      callout: callout({ quality: 'review', diagnostics: ['REVIEW_TEXT_OVERLAP'] }),
      metrics,
    });
    const rectangle = plan.primitives.find((primitive) => primitive.type === 'rectangle');

    expect(rectangle).toMatchObject({
      type: 'rectangle',
      strokeColor: DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE.reviewBorderColor,
    });
    expect(plan.visibleText).toContain('REVIEW');
  });

  it('fails closed when the approved box cannot contain its text', () => {
    expect(() => buildPsIsonoteVectorRenderPlan({
      callout: callout({ box: { x: 300, y: 120, width: 135, height: 12 } }),
      metrics,
    })).toThrow(/smaller than required typography height/);
  });
});
