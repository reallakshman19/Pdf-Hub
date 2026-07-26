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
});
