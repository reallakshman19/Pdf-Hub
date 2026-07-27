import { describe, expect, it } from 'vitest';
import { getStyleContract } from './model';
import { estimateTextWidth, wrapTextMetric, calculateCalloutBoxDimensions } from './typography';
import { buildVectorCalloutPlan, getBoxAnchorTowards } from './vectorCalloutPlan';

describe('Professional Vector Callout Core (Layer 1)', () => {
  it('enforces neutral styling for normal state and orange styling exclusively for review state', () => {
    const normalStyle = getStyleContract(false);
    expect(normalStyle.isReview).toBe(false);
    expect(normalStyle.backgroundColor).toBe('#ffffff');
    expect(normalStyle.textColor).toBe('#0f172a');

    const reviewStyle = getStyleContract(true);
    expect(reviewStyle.isReview).toBe(true);
    expect(reviewStyle.backgroundColor).toBe('#fffaf0');
    expect(reviewStyle.borderColor).toBe('#ea580c');
  });

  it('computes deterministic text width and wraps lines predictably without DOM', () => {
    const text = 'This is a long ISONOTE instruction that needs to be wrapped into multiple lines accurately';
    const lines = wrapTextMetric(text, 120, 9);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(text);
  });

  it('calculates deterministic box height and includes confidence code shorthand', () => {
    const dims = calculateCalloutBoxDimensions('Remove Guide', ':/PS-11168.8 Remove Guide', 'HIGH', 200, 10, 8);
    expect(dims.tagLine).toBe('Tag: Remove Guide');
    expect(dims.noteLines.join(' ')).toContain('ISO Note: :/PS-11168.8 Remove Guide (C=H)');
    expect(dims.height).toBeGreaterThan(50);
  });

  it('builds a complete auditable vector callout plan containing exclusively primitive geometric types', () => {
    const plan = buildVectorCalloutPlan(
      'callout-1',
      'PS-11168.8',
      'Remove Guide',
      ':/PS-11168.8 Remove Guide',
      'HIGH',
      { x: 100, y: 150 },
      { x: 200, y: 130, width: 220 },
      { isReview: false },
    );

    expect(plan.id).toBe('callout-1');
    expect(plan.style.isReview).toBe(false);
    expect(plan.box.width).toBe(220);
    expect(plan.primitives.length).toBeGreaterThan(3);

    const primitiveTypes = plan.primitives.map((p) => p.type);
    expect(primitiveTypes).toContain('line');
    expect(primitiveTypes).toContain('circle');
    expect(primitiveTypes).toContain('rectangle');
    expect(primitiveTypes).toContain('text');
    expect(primitiveTypes).not.toContain('image');
    expect(primitiveTypes).not.toContain('raster');
  });

  it('computes leader anchor point towards target correctly', () => {
    const box = { x: 200, y: 100, width: 100, height: 60 };
    // Target is to the left of the box
    const anchorLeft = getBoxAnchorTowards(box, { x: 150, y: 120 });
    expect(anchorLeft.x).toBe(200);
    expect(anchorLeft.y).toBe(120);
  });

  it('never emits a text line wider than the available width (long token overflow test)', () => {
    const token =
      'PS-11168.8/THIS_IS_A_SINGLE_UNBROKEN_ENGINEERING_IDENTIFIER_' +
      'WITH_A_VERY_LONG_SUFFIX_12345678901234567890';
    const maxWidth = 90;
    const fontSize = 9;
    const lines = wrapTextMetric(token, maxWidth, fontSize);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(
        estimateTextWidth(line, fontSize),
        `Overflowing line: "${line}"`,
      ).toBeLessThanOrEqual(maxWidth);
    }
    expect(lines.join('')).toBe(token);
  });

  it('renders a diagonal relationship using orthogonal vector segments', () => {
    const plan = buildVectorCalloutPlan(
      'callout-orthogonal',
      'PS-101',
      'Elbow Check',
      'Note with diagonal target',
      'HIGH',
      { x: 80, y: 60 },
      { x: 220, y: 180, width: 160 },
    );

    const leaderSegments = plan.primitives.filter(
      (primitive) => primitive.type === 'line',
    );
    expect(leaderSegments.length).toBeGreaterThanOrEqual(2);

    for (const segment of leaderSegments) {
      if (segment.type === 'line') {
        const isHorizontal = segment.start.y === segment.end.y;
        const isVertical = segment.start.x === segment.end.x;
        expect(
          isHorizontal || isVertical,
          `Segment from (${segment.start.x},${segment.start.y}) to (${segment.end.x},${segment.end.y}) is neither horizontal nor vertical.`,
        ).toBe(true);
      }
    }
  });

  it('honors initialBox.height as requested minimum height', () => {
    const plan = buildVectorCalloutPlan(
      'callout-height',
      'PS-102',
      'Short Note',
      'Short',
      'HIGH',
      { x: 100, y: 100 },
      { x: 200, y: 200, width: 150, height: 180 },
    );
    expect(plan.box.height).toBeGreaterThanOrEqual(180);
  });
});
