import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type BoxPlacement,
  type ProfessionalCalloutContent,
  type VectorPrimitive,
  getStyleContract,
} from './model';
import {
  calculateCalloutBoxDimensions,
  estimateTextWidth,
  formatCalloutPresentation,
  formatConfidenceCode,
  wrapTextMetric,
} from './typography';
import {
  type VectorCalloutPlanInput,
  buildVectorCalloutPlan,
  getBoxAnchorTowards,
} from './vectorCalloutPlan';

const normalStyleInput = Object.freeze({ isReview: false, fontSize: 10 });

function createInput(
  content: ProfessionalCalloutContent = {
    tagValue: 'Remove Guide',
    isoNoteValue: ':/PS-11168.8 Remove Guide',
    confidence: 'HIGH',
  },
): VectorCalloutPlanInput {
  return {
    id: 'callout-1',
    psNo: 'PS-11168.8',
    content,
    targetPoint: { x: 100, y: 150 },
    boxPlacement: { x: 200, y: 130, width: 220 },
    style: normalStyleInput,
  };
}

function expectLinesWithinWidth(
  lines: readonly string[],
  width: number,
  fontSize: number,
): void {
  for (const line of lines) {
    expect(estimateTextWidth(line, fontSize)).toBeLessThanOrEqual(width);
  }
}

describe('professional vector callout model and typography', () => {
  it('uses exact PDF font identifiers with deterministic normal and review styles', () => {
    const normal = getStyleContract(normalStyleInput);
    const review = getStyleContract({ isReview: true, fontSize: 10 });

    expect(normal.tagFontId).toBe('Helvetica-Bold');
    expect(normal.bodyFontId).toBe('Helvetica');
    expect(normal.backgroundColor).toBe('#ffffff');
    expect(review.backgroundColor).toBe('#fffaf0');
    expect(review.borderColor).toBe('#ea580c');
    expect(() => getStyleContract({ isReview: false, fontSize: 0 })).toThrow(RangeError);
  });

  it('maps every closed confidence state explicitly', () => {
    expect(formatConfidenceCode('HIGH')).toBe('H');
    expect(formatConfidenceCode('MEDIUM')).toBe('M');
    expect(formatConfidenceCode('LOW')).toBe('L');
    expect(formatCalloutPresentation({ isoNoteValue: 'note', confidence: 'HIGH' })).toEqual({
      noteText: 'ISO Note: note (C=H)',
    });
    expect(formatCalloutPresentation({ isoNoteValue: 'note', confidence: 'MEDIUM' })).toEqual({
      noteText: 'ISO Note: note (C=M)',
    });
    expect(formatCalloutPresentation({ isoNoteValue: 'note', confidence: 'LOW' })).toEqual({
      noteText: 'ISO Note: note (C=L)',
    });
    expect(() => formatCalloutPresentation({
      isoNoteValue: 'note (C=H)',
      confidence: 'HIGH',
    })).toThrow(
      'isoNoteValue must not include a confidence suffix when confidence is provided.',
    );
  });

  it('owns prefixes once and rejects pre-prefixed semantic values', () => {
    expect(formatCalloutPresentation(createInput().content)).toEqual({
      tagText: 'Tag: Remove Guide',
      noteText: 'ISO Note: :/PS-11168.8 Remove Guide (C=H)',
    });
    expect(formatCalloutPresentation({ tagValue: '  Remove Guide  ' })).toEqual({
      tagText: 'Tag: Remove Guide',
    });
    expect(formatCalloutPresentation({ isoNoteValue: 'note' })).toEqual({
      noteText: 'ISO Note: note',
    });
    expect(() => formatCalloutPresentation({ tagValue: '  TAG: Duplicate' })).toThrow(
      'tagValue must not include the presentation prefix "Tag:".',
    );
    expect(() => formatCalloutPresentation({ isoNoteValue: '\tiso note: Duplicate' })).toThrow(
      'isoNoteValue must not include the presentation prefix "ISO Note:".',
    );
  });

  it('preserves exact whitespace while wrapping at deterministic boundaries', () => {
    const text = 'AA  BB\tCC\nDD   EE';
    const lines = wrapTextMetric(text, 30, 9);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(text);
    expectLinesWithinWidth(lines, 30, 9);
  });

  it.each([
    'PS-11168/DATUM',
    '8IN-SCH160-A106-B-SEAMLESS-PIPE-SPECIFICATION',
    'C:\\PROJECTS\\PDF-HUB\\PS-11168.8\\DATUM',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  ])('splits oversized unbroken text without character loss: %s', (text) => {
    const lines = wrapTextMetric(text, 35, 9);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(text);
    expectLinesWithinWidth(lines, 35, 9);
  });

  it('throws when the usable width cannot fit one code point', () => {
    expect(() => wrapTextMetric('W', 1, 10)).toThrow(
      'maxLineWidth cannot fit the next Unicode code point.',
    );
  });

  it('derives exact dimensions from rendered lines, metrics, gap, and padding', () => {
    const style = getStyleContract(normalStyleInput);
    const dimensions = calculateCalloutBoxDimensions(createInput().content, 220, style);
    const expectedHeight = Math.ceil(
      style.padding * 2
      + (dimensions.tagLines.length + dimensions.noteLines.length) * style.lineHeight
      + style.sectionGap,
    );

    expect(dimensions.height).toBe(expectedHeight);
    expect(dimensions.width).toBe(220);
    expect(dimensions.usableWidth).toBe(204);
    expect(dimensions.tagLines.join('')).toBe('Tag: Remove Guide');
    expect(dimensions.noteLines.join('')).toBe(
      'ISO Note: :/PS-11168.8 Remove Guide (C=H)',
    );
    expectLinesWithinWidth(dimensions.tagLines, dimensions.usableWidth, style.fontSize);
    expectLinesWithinWidth(dimensions.noteLines, dimensions.usableWidth, style.fontSize);
  });

  it('converts source hard breaks into separate renderable lines', () => {
    const style = getStyleContract(normalStyleInput);
    const dimensions = calculateCalloutBoxDimensions(
      { isoNoteValue: 'First\nSecond\r\nThird' },
      220,
      style,
    );

    expect(dimensions.noteLines).toEqual(['ISO Note: First', 'Second', 'Third']);
    expect(dimensions.noteLines.every((line) => !/[\r\n]/u.test(line))).toBe(true);
  });

  it('handles empty optional content without malformed text or artificial height', () => {
    const style = getStyleContract(normalStyleInput);
    const dimensions = calculateCalloutBoxDimensions({}, 220, style);
    const emptyStrings = { tagValue: '  ', isoNoteValue: '\t', confidence: 'HIGH' as const };

    expect(formatCalloutPresentation({})).toEqual({});
    expect(formatCalloutPresentation(emptyStrings)).toEqual({});
    expect(dimensions.tagLines).toEqual([]);
    expect(dimensions.noteLines).toEqual([]);
    expect(dimensions.height).toBe(style.padding * 2);
  });

  it('rejects invalid box dimensions rather than applying a fallback width', () => {
    const style = getStyleContract(normalStyleInput);
    expect(() => calculateCalloutBoxDimensions({}, 0, style)).toThrow(RangeError);
    expect(() => calculateCalloutBoxDimensions({ tagValue: 'W' }, 17, style)).toThrow(
      'maxLineWidth cannot fit the next Unicode code point.',
    );
  });
});

describe('professional vector callout plan', () => {
  it('builds primitives in deterministic order with semantic content only', () => {
    const plan = buildVectorCalloutPlan(createInput());
    const types = plan.primitives.map((primitive) => primitive.type);
    const textPrimitives = plan.primitives.filter((primitive) => primitive.type === 'text');

    expect(types.slice(0, 3)).toEqual(['line', 'circle', 'rectangle']);
    expect(textPrimitives.map((primitive) => primitive.text).join('')).toBe(
      'Tag: Remove GuideISO Note: :/PS-11168.8 Remove Guide (C=H)',
    );
    expect(textPrimitives[0].fontId).toBe('Helvetica-Bold');
    expect(
      textPrimitives.slice(1).every((primitive) => primitive.fontId === 'Helvetica'),
    ).toBe(true);
    expect(plan.content).toEqual(createInput().content);
    expect(plan.content.tagValue).toBe('Remove Guide');
    expect(plan.content.isoNoteValue).toBe(':/PS-11168.8 Remove Guide');
  });

  it('produces deeply equal geometry and primitive values on repeated runs', () => {
    const input = Object.freeze({
      ...createInput(),
      content: Object.freeze(createInput().content),
      targetPoint: Object.freeze(createInput().targetPoint),
      boxPlacement: Object.freeze(createInput().boxPlacement),
      style: normalStyleInput,
    });

    expect(buildVectorCalloutPlan(input)).toStrictEqual(buildVectorCalloutPlan(input));
  });

  it('does not mutate or reuse caller-owned objects', () => {
    const content = Object.freeze({
      tagValue: 'Remove Guide',
      isoNoteValue: ':/PS-11168.8 Remove Guide',
      confidence: 'HIGH' as const,
    });
    const targetPoint = Object.freeze({ x: 100, y: 150 });
    const boxPlacement = Object.freeze({ x: 200, y: 130, width: 220 });
    const input = Object.freeze({
      ...createInput(content),
      content,
      targetPoint,
      boxPlacement,
      style: normalStyleInput,
    });
    const before = JSON.stringify(input);
    const plan = buildVectorCalloutPlan(input);
    const leader = plan.primitives[0];
    const marker = plan.primitives[1];
    const rectangle = plan.primitives[2];

    expect(JSON.stringify(input)).toBe(before);
    expect(plan.content).not.toBe(content);
    expect(plan.targetPoint).not.toBe(targetPoint);
    expect(leader.type).toBe('line');
    expect(marker.type).toBe('circle');
    expect(rectangle.type).toBe('rectangle');
    if (leader.type === 'line') expect(leader.end).not.toBe(targetPoint);
    if (marker.type === 'circle') expect(marker.center).not.toBe(targetPoint);
    if (rectangle.type === 'rectangle') expect(rectangle.rect).not.toBe(plan.box);
  });

  it('computes the leader anchor toward the target', () => {
    const box = { x: 200, y: 100, width: 100, height: 60 };
    expect(getBoxAnchorTowards(box, { x: 150, y: 120 })).toEqual({ x: 200, y: 120 });
  });

  it('rejects non-finite geometry', () => {
    const input = createInput();
    expect(() => buildVectorCalloutPlan({
      ...input,
      targetPoint: { x: Number.NaN, y: 150 },
    })).toThrow('targetPoint.x must be finite.');
    expect(() => buildVectorCalloutPlan({
      ...input,
      boxPlacement: { x: 200, y: 130, width: Number.POSITIVE_INFINITY },
    })).toThrow('boxPlacement.width must be a positive finite number.');
  });

  it('exposes no height input, duplicate width, image, or raster primitive capability', () => {
    expectTypeOf<BoxPlacement>().toEqualTypeOf<{
      readonly x: number;
      readonly y: number;
      readonly width: number;
    }>();
    expectTypeOf<VectorCalloutPlanInput['boxPlacement']>().toEqualTypeOf<BoxPlacement>();
    expectTypeOf<VectorPrimitive['type']>().toEqualTypeOf<
      'rectangle' | 'line' | 'circle' | 'text'
    >();
  });
});
