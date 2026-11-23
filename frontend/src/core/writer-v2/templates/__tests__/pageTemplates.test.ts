import { describe, expect, it } from 'vitest';
import {
  ALL_PAGE_TEMPLATE_KINDS,
  PAGE_TEMPLATE_PRESETS,
  calculateCornellLayout,
  calculateDotGridPoints,
  calculateGridLines,
  calculateMusicStaffs,
  calculateRuledLines,
  getDefaultPageTemplateOptions,
  normalizeTemplateOptions,
  resolvePageTemplate,
} from '../pageTemplates';
import type { WriterPageSetupV2 } from '../../types';

describe('pageTemplates', () => {
  it('covers all 6 template kinds in presets', () => {
    expect(ALL_PAGE_TEMPLATE_KINDS).toEqual([
      'blank',
      'ruled',
      'grid',
      'dot-grid',
      'cornell',
      'music-staff',
    ]);

    for (const kind of ALL_PAGE_TEMPLATE_KINDS) {
      expect(PAGE_TEMPLATE_PRESETS[kind].kind).toBe(kind);
      expect(PAGE_TEMPLATE_PRESETS[kind].label).toBeTruthy();
      expect(PAGE_TEMPLATE_PRESETS[kind].description).toBeTruthy();
    }
  });

  it('resolves default template when pageSetup has no template', () => {
    expect(resolvePageTemplate(null)).toEqual({ kind: 'blank' });
    expect(resolvePageTemplate(undefined)).toEqual({ kind: 'blank' });

    const setup: WriterPageSetupV2 = {
      preset: 'A4',
      width: 595,
      height: 842,
      unit: 'pt',
      marginTop: 72,
      marginRight: 72,
      marginBottom: 72,
      marginLeft: 72,
    };

    expect(resolvePageTemplate(setup, 0)).toEqual({ kind: 'blank' });
  });

  it('resolves pageTemplate and per-page overrides correctly', () => {
    const setup: WriterPageSetupV2 = {
      preset: 'A4',
      width: 595,
      height: 842,
      unit: 'pt',
      marginTop: 72,
      marginRight: 72,
      marginBottom: 72,
      marginLeft: 72,
      pageTemplate: { kind: 'ruled', spacing: 25 },
      pageTemplates: {
        1: { kind: 'grid', spacing: 15 },
      },
    };

    const p0 = resolvePageTemplate(setup, 0);
    expect(p0.kind).toBe('ruled');
    expect(p0.spacing).toBe(25);

    const p1 = resolvePageTemplate(setup, 1);
    expect(p1.kind).toBe('grid');
    expect(p1.spacing).toBe(15);

    const p2 = resolvePageTemplate(setup, 2);
    expect(p2.kind).toBe('ruled');
    expect(p2.spacing).toBe(25);
  });

  it('normalizes template options with safe defaults', () => {
    const normalized = normalizeTemplateOptions({
      kind: 'dot-grid',
      spacing: -5,
      lineColor: '',
    });

    expect(normalized.kind).toBe('dot-grid');
    expect(normalized.spacing).toBe(18); // default dot spacing
    expect(normalized.lineColor).toBe('#94a3b8');
    expect(normalized.dotSize).toBe(1.5);
  });

  it('calculates ruled lines geometry', () => {
    const ruled = calculateRuledLines(600, 800, 50, 50, 40, 40, {
      kind: 'ruled',
      spacing: 20,
      showMarginLine: true,
    });

    expect(ruled.lines.length).toBeGreaterThan(30);
    expect(ruled.lines[0].x1).toBe(40);
    expect(ruled.lines[0].x2).toBe(560);
    expect(ruled.lines[0].y1).toBe(50);
    expect(ruled.marginLine).toBeDefined();
    expect(ruled.marginLine?.x1).toBe(40);
    expect(ruled.marginLine?.y1).toBe(50);
    expect(ruled.marginLine?.y2).toBe(750);
  });

  it('calculates grid lines geometry', () => {
    const grid = calculateGridLines(200, 200, 20, 20, 20, 20, {
      kind: 'grid',
      spacing: 20,
    }, true);

    expect(grid.horizontalLines.length).toBe(9); // 20 to 180 step 20 = 9 lines
    expect(grid.verticalLines.length).toBe(9);
    expect(grid.horizontalLines[0].x1).toBe(20);
    expect(grid.horizontalLines[0].x2).toBe(180);
  });

  it('calculates dot grid points geometry', () => {
    const dots = calculateDotGridPoints(200, 200, 20, 20, 20, 20, {
      kind: 'dot-grid',
      spacing: 20,
    }, true);

    expect(dots.length).toBe(81); // 9 x 9 = 81 points
    expect(dots[0]).toEqual({ x: 20, y: 20 });
    expect(dots[dots.length - 1]).toEqual({ x: 180, y: 180 });
  });

  it('calculates Cornell layout geometry with header, cue, notes, and summary sections', () => {
    const cornell = calculateCornellLayout(600, 800, 50, 50, 50, 50, {
      kind: 'cornell',
      spacing: 25,
    });

    expect(cornell.headerLine.y1).toBe(100); // 50 + 50
    expect(cornell.summaryLine.y1).toBe(660); // 750 - 90
    expect(cornell.cueDividerLine.x1).toBe(200); // 50 + 150
    expect(cornell.ruledLines.length).toBeGreaterThan(15);
    expect(cornell.ruledLines[0].x1).toBe(200);
    expect(cornell.ruledLines[0].x2).toBe(550);
  });

  it('calculates music manuscript staves geometry with 5-line sets', () => {
    const staffs = calculateMusicStaffs(600, 800, 50, 50, 50, 50, {
      kind: 'music-staff',
      spacing: 8,
    });

    expect(staffs.length).toBeGreaterThan(5);
    for (const staff of staffs) {
      expect(staff.lines).toHaveLength(5);
      expect(staff.lines[0].x1).toBe(50);
      expect(staff.lines[0].x2).toBe(550);
      expect(staff.lines[1].y1 - staff.lines[0].y1).toBe(8);
      expect(staff.lines[4].y1 - staff.lines[0].y1).toBe(32);
    }
  });

  it('returns default options for all kinds', () => {
    for (const kind of ALL_PAGE_TEMPLATE_KINDS) {
      const opts = getDefaultPageTemplateOptions(kind);
      expect(opts.kind).toBe(kind);
    }
  });
});
