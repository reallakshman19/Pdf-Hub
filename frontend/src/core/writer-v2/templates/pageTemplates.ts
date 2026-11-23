import type {
  WriterPageSetupV2,
  WriterPageTemplateKind,
  WriterPageTemplateOptions,
} from '../types';

export interface PageTemplatePresetMeta {
  kind: WriterPageTemplateKind;
  label: string;
  description: string;
  defaultSpacing: number;
  defaultLineColor: string;
  defaultLineWidth: number;
  defaultMarginLineColor?: string;
  defaultShowMarginLine?: boolean;
  defaultDotSize?: number;
}

export const PAGE_TEMPLATE_PRESETS: Record<WriterPageTemplateKind, PageTemplatePresetMeta> = {
  blank: {
    kind: 'blank',
    label: 'Blank Canvas',
    description: 'Plain clean page with no background pattern or lines.',
    defaultSpacing: 0,
    defaultLineColor: '#cbd5e1',
    defaultLineWidth: 0.75,
  },
  ruled: {
    kind: 'ruled',
    label: 'Ruled Notebook',
    description: 'Horizontal ruled lines for handwriting, notes, and journaling.',
    defaultSpacing: 24, // Standard ~8.5mm wide rule in pt
    defaultLineColor: '#cbd5e1',
    defaultLineWidth: 0.75,
    defaultMarginLineColor: '#fca5a5',
    defaultShowMarginLine: true,
  },
  grid: {
    kind: 'grid',
    label: 'Engineering Grid',
    description: 'Uniform Cartesian grid matrix for diagrams, plots, and schematics.',
    defaultSpacing: 20, // 20pt (~7mm) grid
    defaultLineColor: '#e2e8f0',
    defaultLineWidth: 0.75,
  },
  'dot-grid': {
    kind: 'dot-grid',
    label: 'Dot Grid',
    description: 'Matrix of subtle dots for flexible bullet journaling and wireframing.',
    defaultSpacing: 18, // 18pt (~6.35mm) dot pitch
    defaultLineColor: '#94a3b8',
    defaultLineWidth: 0.75,
    defaultDotSize: 1.5,
  },
  cornell: {
    kind: 'cornell',
    label: 'Cornell Notes',
    description: 'Structured academic layout with header, cue column, notes area, and summary.',
    defaultSpacing: 24,
    defaultLineColor: '#cbd5e1',
    defaultLineWidth: 0.75,
    defaultMarginLineColor: '#94a3b8',
    defaultShowMarginLine: true,
  },
  'music-staff': {
    kind: 'music-staff',
    label: 'Music Manuscript',
    description: 'Standard 5-line musical staves for music notation and composition.',
    defaultSpacing: 7, // 7pt between lines of a staff
    defaultLineColor: '#64748b',
    defaultLineWidth: 0.75,
  },
};

export const ALL_PAGE_TEMPLATE_KINDS: WriterPageTemplateKind[] = [
  'blank',
  'ruled',
  'grid',
  'dot-grid',
  'cornell',
  'music-staff',
];

export function getDefaultPageTemplateOptions(kind: WriterPageTemplateKind): WriterPageTemplateOptions {
  const preset = PAGE_TEMPLATE_PRESETS[kind];
  return {
    kind,
    spacing: preset.defaultSpacing,
    lineColor: preset.defaultLineColor,
    lineWidth: preset.defaultLineWidth,
    marginLineColor: preset.defaultMarginLineColor,
    showMarginLine: preset.defaultShowMarginLine,
    dotSize: preset.defaultDotSize,
  };
}

export function resolvePageTemplate(
  pageSetup?: WriterPageSetupV2 | null,
  pageIndex = 0,
): WriterPageTemplateOptions {
  if (!pageSetup) {
    return { kind: 'blank' };
  }

  const override = pageSetup.pageTemplates?.[pageIndex];
  if (override) {
    return normalizeTemplateOptions(override);
  }

  if (pageSetup.pageTemplate) {
    return normalizeTemplateOptions(pageSetup.pageTemplate);
  }

  return { kind: 'blank' };
}

export function normalizeTemplateOptions(
  options: WriterPageTemplateOptions,
): WriterPageTemplateOptions {
  const meta = PAGE_TEMPLATE_PRESETS[options.kind] ?? PAGE_TEMPLATE_PRESETS.blank;
  const spacing = typeof options.spacing === 'number' && Number.isFinite(options.spacing) && options.spacing > 0
    ? options.spacing
    : meta.defaultSpacing;

  const lineColor = options.lineColor?.trim() || meta.defaultLineColor;
  const lineWidth = typeof options.lineWidth === 'number' && Number.isFinite(options.lineWidth) && options.lineWidth > 0
    ? options.lineWidth
    : meta.defaultLineWidth;

  return {
    kind: options.kind,
    spacing,
    lineColor,
    lineWidth,
    marginLineColor: options.marginLineColor?.trim() ?? meta.defaultMarginLineColor,
    showMarginLine: options.showMarginLine ?? meta.defaultShowMarginLine,
    dotSize: options.dotSize ?? meta.defaultDotSize,
  };
}

export interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PointCoord {
  x: number;
  y: number;
}

export interface RuledGeometry {
  lines: LineSegment[];
  marginLine?: LineSegment;
}

export function calculateRuledLines(
  width: number,
  height: number,
  marginTop: number,
  marginBottom: number,
  marginLeft: number,
  marginRight: number,
  options?: WriterPageTemplateOptions,
): RuledGeometry {
  const norm = options ? normalizeTemplateOptions(options) : getDefaultPageTemplateOptions('ruled');
  const spacing = norm.spacing || 24;
  const lines: LineSegment[] = [];

  const startY = Math.max(marginTop, spacing);
  const endY = height - marginBottom;

  for (let y = startY; y <= endY; y += spacing) {
    lines.push({
      x1: marginLeft,
      y1: y,
      x2: width - marginRight,
      y2: y,
    });
  }

  let marginLine: LineSegment | undefined;
  if (norm.showMarginLine && marginLeft > 0) {
    marginLine = {
      x1: marginLeft,
      y1: marginTop,
      x2: marginLeft,
      y2: height - marginBottom,
    };
  }

  return { lines, marginLine };
}

export interface GridGeometry {
  horizontalLines: LineSegment[];
  verticalLines: LineSegment[];
}

export function calculateGridLines(
  width: number,
  height: number,
  marginTop: number,
  marginBottom: number,
  marginLeft: number,
  marginRight: number,
  options?: WriterPageTemplateOptions,
  contentOnly = true,
): GridGeometry {
  const norm = options ? normalizeTemplateOptions(options) : getDefaultPageTemplateOptions('grid');
  const spacing = norm.spacing || 20;

  const startX = contentOnly ? marginLeft : 0;
  const endX = contentOnly ? width - marginRight : width;
  const startY = contentOnly ? marginTop : 0;
  const endY = contentOnly ? height - marginBottom : height;

  const horizontalLines: LineSegment[] = [];
  for (let y = startY; y <= endY + 0.1; y += spacing) {
    horizontalLines.push({
      x1: startX,
      y1: y,
      x2: endX,
      y2: y,
    });
  }

  const verticalLines: LineSegment[] = [];
  for (let x = startX; x <= endX + 0.1; x += spacing) {
    verticalLines.push({
      x1: x,
      y1: startY,
      x2: x,
      y2: endY,
    });
  }

  return { horizontalLines, verticalLines };
}

export function calculateDotGridPoints(
  width: number,
  height: number,
  marginTop: number,
  marginBottom: number,
  marginLeft: number,
  marginRight: number,
  options?: WriterPageTemplateOptions,
  contentOnly = true,
): PointCoord[] {
  const norm = options ? normalizeTemplateOptions(options) : getDefaultPageTemplateOptions('dot-grid');
  const spacing = norm.spacing || 18;

  const startX = contentOnly ? marginLeft : spacing;
  const endX = contentOnly ? width - marginRight : width - spacing;
  const startY = contentOnly ? marginTop : spacing;
  const endY = contentOnly ? height - marginBottom : height - spacing;

  const points: PointCoord[] = [];
  for (let y = startY; y <= endY + 0.1; y += spacing) {
    for (let x = startX; x <= endX + 0.1; x += spacing) {
      points.push({ x, y });
    }
  }

  return points;
}

export interface CornellLayoutGeometry {
  headerLine: LineSegment;
  cueDividerLine: LineSegment;
  summaryLine: LineSegment;
  ruledLines: LineSegment[];
  headerBox: { x: number; y: number; width: number; height: number };
  cueBox: { x: number; y: number; width: number; height: number };
  notesBox: { x: number; y: number; width: number; height: number };
  summaryBox: { x: number; y: number; width: number; height: number };
}

export function calculateCornellLayout(
  width: number,
  height: number,
  marginTop: number,
  marginBottom: number,
  marginLeft: number,
  marginRight: number,
  options?: WriterPageTemplateOptions,
): CornellLayoutGeometry {
  const norm = options ? normalizeTemplateOptions(options) : getDefaultPageTemplateOptions('cornell');
  const spacing = norm.spacing || 24;

  const contentLeft = marginLeft;
  const contentRight = width - marginRight;
  const contentTop = marginTop;
  const contentBottom = height - marginBottom;
  const contentWidth = contentRight - contentLeft;
  const contentHeight = contentBottom - contentTop;

  // Header height: standard 50pt
  const headerHeight = Math.min(50, Math.floor(contentHeight * 0.12));
  const headerY = contentTop + headerHeight;

  // Summary height: standard 90pt at bottom
  const summaryHeight = Math.min(90, Math.floor(contentHeight * 0.2));
  const summaryY = contentBottom - summaryHeight;

  // Cue column width: 30% of content width (typically ~150-180pt)
  const cueWidth = Math.min(180, Math.max(100, Math.floor(contentWidth * 0.3)));
  const cueDividerX = contentLeft + cueWidth;

  const headerLine: LineSegment = {
    x1: contentLeft,
    y1: headerY,
    x2: contentRight,
    y2: headerY,
  };

  const summaryLine: LineSegment = {
    x1: contentLeft,
    y1: summaryY,
    x2: contentRight,
    y2: summaryY,
  };

  const cueDividerLine: LineSegment = {
    x1: cueDividerX,
    y1: headerY,
    x2: cueDividerX,
    y2: summaryY,
  };

  // Optional subtle ruled lines inside the notes area
  const ruledLines: LineSegment[] = [];
  for (let y = headerY + spacing; y < summaryY - 4; y += spacing) {
    ruledLines.push({
      x1: cueDividerX,
      y1: y,
      x2: contentRight,
      y2: y,
    });
  }

  return {
    headerLine,
    cueDividerLine,
    summaryLine,
    ruledLines,
    headerBox: {
      x: contentLeft,
      y: contentTop,
      width: contentWidth,
      height: headerHeight,
    },
    cueBox: {
      x: contentLeft,
      y: headerY,
      width: cueWidth,
      height: summaryY - headerY,
    },
    notesBox: {
      x: cueDividerX,
      y: headerY,
      width: contentRight - cueDividerX,
      height: summaryY - headerY,
    },
    summaryBox: {
      x: contentLeft,
      y: summaryY,
      width: contentWidth,
      height: summaryHeight,
    },
  };
}

export interface MusicStaffGeometry {
  staffIndex: number;
  topY: number;
  lines: LineSegment[];
}

export function calculateMusicStaffs(
  width: number,
  height: number,
  marginTop: number,
  marginBottom: number,
  marginLeft: number,
  marginRight: number,
  options?: WriterPageTemplateOptions,
): MusicStaffGeometry[] {
  const norm = options ? normalizeTemplateOptions(options) : getDefaultPageTemplateOptions('music-staff');
  const lineSpacing = norm.spacing || 7;
  const staffHeight = lineSpacing * 4; // 5 lines, 4 intervals
  const interStaffGap = staffHeight * 1.5; // gap between staves

  const contentLeft = marginLeft;
  const contentRight = width - marginRight;
  const contentTop = marginTop + 10;
  const contentBottom = height - marginBottom - 10;

  const staffs: MusicStaffGeometry[] = [];
  let currentY = contentTop;
  let staffIndex = 0;

  while (currentY + staffHeight <= contentBottom) {
    const lines: LineSegment[] = [];
    for (let i = 0; i < 5; i += 1) {
      const y = currentY + i * lineSpacing;
      lines.push({
        x1: contentLeft,
        y1: y,
        x2: contentRight,
        y2: y,
      });
    }

    staffs.push({
      staffIndex,
      topY: currentY,
      lines,
    });

    staffIndex += 1;
    currentY += staffHeight + interStaffGap;
  }

  return staffs;
}
