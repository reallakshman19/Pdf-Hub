import { describe, expect, it } from 'vitest';
import { projectSelectedSpan } from './textSelectionGeometry';

describe('ALT WP01 selected-word geometry', () => {
  const span = { left: 172, top: 229, width: 180, height: 17 };
  const page = { left: 100, top: 100 };
  it('uses substring fractions instead of the whole PDF text span', () => {
    const rect = projectSelectedSpan(span, { left: 172, width: 160 },
      { left: 172, right: 252 }, page, 1)!;
    expect(rect).toEqual({ x: 72, y: 129, width: 90, height: 17 });
    expect(rect.width).toBeLessThan(180);
  });
  it('maintains PDF-space measurements at zoom 150%', () => {
    const rect = projectSelectedSpan({ left: 208, top: 293.5, width: 270, height: 25.5 },
      { left: 208, width: 240 }, { left: 208, right: 328 },
      { left: 100, top: 100 }, 1.5)!;
    expect(rect.x).toBe(72);
    expect(rect.width).toBe(90);
  });
  it('rejects empty/zero-width range and invalid zoom (negative controls)', () => {
    expect(projectSelectedSpan(span, { left: 172, width: 160 },
      { left: 200, right: 200 }, page, 1)).toBeNull();
    expect(projectSelectedSpan(span, { left: 172, width: 0 },
      { left: 172, right: 200 }, page, 1)).toBeNull();
    expect(projectSelectedSpan(span, { left: 172, width: 160 },
      { left: 172, right: 200 }, page, 0)).toBeNull();
  });
});
