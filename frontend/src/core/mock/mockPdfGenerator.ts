/**
 * mockPdfGenerator.ts
 *
 * Generates an 8-page benchmark PDF using pdf-lib.
 * Each page targets a distinct DocCraft feature so testers can exercise
 * the full pipeline (render, annotate, draw, write, organize, search,
 * equation, OCR) without needing a real document.
 *
 * INV-2 compliant: fitz (PyMuPDF) is never imported here.
 * INV-11 compliant: no console.log.
 */

import { pdfLib } from '@/core/pdf/lazyPdfLib';

type PDFPageT = import('pdf-lib').PDFPage;
type PDFFontT = import('pdf-lib').PDFFont;
type RGBT = import('pdf-lib').RGB;
type PdfLibNs = Awaited<ReturnType<typeof pdfLib>>;

// ─────────────────────────────────────────────
// Lazily-loaded pdf-lib namespace and colour palette.
// Both are populated once, by ensurePdfLibLoaded(), before generateMockPdf()
// does any drawing — every helper below runs only after that has resolved.
// ─────────────────────────────────────────────
let pdfLibCache: PdfLibNs | null = null;
let paletteCache: Record<string, RGBT> | null = null;

function lib(): PdfLibNs {
  if (!pdfLibCache) {
    throw new Error('pdf-lib not loaded yet — ensurePdfLibLoaded() must run first');
  }
  return pdfLibCache;
}

function buildPalette(rgb: PdfLibNs['rgb']) {
  return {
    white:     rgb(1,    1,    1),
    black:     rgb(0,    0,    0),
    slate900:  rgb(0.09, 0.11, 0.15),
    slate700:  rgb(0.22, 0.27, 0.36),
    slate400:  rgb(0.58, 0.64, 0.72),
    slate200:  rgb(0.88, 0.91, 0.96),
    slate100:  rgb(0.94, 0.96, 0.98),
    blue600:   rgb(0.15, 0.39, 0.92),
    blue100:   rgb(0.84, 0.90, 1.00),
    purple600: rgb(0.58, 0.18, 0.90),
    purple100: rgb(0.93, 0.85, 1.00),
    green600:  rgb(0.09, 0.63, 0.38),
    green100:  rgb(0.82, 0.97, 0.89),
    amber600:  rgb(0.87, 0.54, 0.05),
    amber100:  rgb(1.00, 0.95, 0.80),
    red600:    rgb(0.86, 0.15, 0.15),
    red100:    rgb(1.00, 0.88, 0.88),
    teal600:   rgb(0.05, 0.62, 0.65),
    teal100:   rgb(0.83, 0.97, 0.98),
  } as const;
}

function C(): ReturnType<typeof buildPalette> {
  if (!paletteCache) {
    paletteCache = buildPalette(lib().rgb);
  }
  return paletteCache as ReturnType<typeof buildPalette>;
}

async function ensurePdfLibLoaded(): Promise<void> {
  if (!pdfLibCache) {
    pdfLibCache = await pdfLib();
  }
  if (!paletteCache) {
    paletteCache = buildPalette(pdfLibCache.rgb);
  }
}

function rgb(r: number, g: number, b: number): RGBT {
  return lib().rgb(r, g, b);
}

function degrees(angle: number) {
  return lib().degrees(angle);
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function pill(
  page: PDFPageT,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: RGBT,
  text: string,
  font: PDFFontT,
  fontSize: number,
  textColor: RGBT = C().white,
): void {
  const r = h / 2;
  page.drawRectangle({ x: x + r, y, width: w - 2 * r, height: h, color: fill, borderWidth: 0 });
  page.drawCircle({ x: x + r, y: y + r, size: r, color: fill, borderWidth: 0 });
  page.drawCircle({ x: x + w - r, y: y + r, size: r, color: fill, borderWidth: 0 });
  const tw = font.widthOfTextAtSize(text, fontSize);
  page.drawText(text, {
    x: x + (w - tw) / 2,
    y: y + (h - fontSize) / 2 + 1,
    size: fontSize,
    font,
    color: textColor,
  });
}

function badge(
  page: PDFPageT,
  x: number,
  y: number,
  text: string,
  font: PDFFontT,
  bg: RGBT,
  fg: RGBT = C().white,
): void {
  pill(page, x, y, font.widthOfTextAtSize(text, 8) + 16, 16, bg, text, font, 8, fg);
}

function headerBar(
  page: PDFPageT,
  accentColor: RGBT,
  font: PDFFontT,
  boldFont: PDFFontT,
  pageLabel: string,
  pageNumber: number,
  total: number,
): void {
  const { width, height } = page.getSize();

  // Full-width accent strip
  page.drawRectangle({ x: 0, y: height - 48, width, height: 48, color: accentColor });

  // Logo mark
  page.drawRectangle({ x: 24, y: height - 38, width: 20, height: 28, color: C().white, opacity: 0.2, borderWidth: 0 });
  page.drawText('D', { x: 29, y: height - 30, size: 14, font: boldFont, color: C().white });

  // Page label
  page.drawText(pageLabel, {
    x: 56, y: height - 32, size: 13, font: boldFont, color: C().white,
  });

  // Page counter (right side)
  const counter = `${pageNumber} / ${total}`;
  const cw = font.widthOfTextAtSize(counter, 9);
  page.drawText(counter, {
    x: width - cw - 24, y: height - 30, size: 9, font, color: C().white, opacity: 0.75,
  });

  // Thin separator line below header
  page.drawLine({
    start: { x: 0, y: height - 49 },
    end:   { x: width, y: height - 49 },
    thickness: 1,
    color: rgb(0, 0, 0),
    opacity: 0.06,
  });
}

function footerBar(page: PDFPageT, font: PDFFontT, note: string): void {
  const { width } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height: 32, color: C().slate100 });
  page.drawLine({
    start: { x: 0, y: 32 }, end: { x: width, y: 32 },
    thickness: 1, color: C().slate200,
  });
  page.drawText('DocCraft Benchmark PDF  -  dev-only', {
    x: 24, y: 11, size: 8, font, color: C().slate400,
  });
  const nw = font.widthOfTextAtSize(note, 8);
  page.drawText(note, { x: width - nw - 24, y: 11, size: 8, font, color: C().slate400 });
}

function sectionHeading(
  page: PDFPageT,
  boldFont: PDFFontT,
  text: string,
  y: number,
  accentColor: RGBT,
): void {
  page.drawRectangle({ x: 24, y, width: 3, height: 16, color: accentColor });
  page.drawText(text, { x: 34, y: y + 2, size: 11, font: boldFont, color: C().slate900 });
}

function row(
  page: PDFPageT,
  font: PDFFontT,
  y: number,
  cols: string[],
  widths: number[],
  isHeader = false,
  bg?: RGBT,
): void {
  const xStart = 24;
  const rowH = 18;
  if (bg) {
    page.drawRectangle({ x: xStart, y, width: widths.reduce((a, b) => a + b, 0), height: rowH, color: bg });
  }
  let x = xStart;
  cols.forEach((col, i) => {
    page.drawText(col, {
      x: x + 4, y: y + 5,
      size: isHeader ? 8 : 8,
      font: isHeader ? font : font,
      color: isHeader ? C().white : C().slate700,
    });
    x += widths[i]!;
  });
}

// ─────────────────────────────────────────────
// Page generators
// ─────────────────────────────────────────────

/** P1 — Cover / Table of Contents */
function buildCover(page: PDFPageT, fonts: Fonts): void {
  const { width, height } = page.getSize();
  const { regular, bold, mono } = fonts;

  // Background gradient simulation — layered rectangles
  page.drawRectangle({ x: 0, y: 0, width, height, color: C().slate900 });
  page.drawRectangle({ x: 0, y: height * 0.55, width, height: height * 0.45, color: rgb(0.10, 0.13, 0.22) });

  // Decorative circles
  page.drawCircle({ x: width * 0.82, y: height * 0.78, size: 120, color: rgb(0.15, 0.39, 0.92), opacity: 0.15, borderWidth: 0 });
  page.drawCircle({ x: width * 0.15, y: height * 0.25, size: 80, color: rgb(0.58, 0.18, 0.90), opacity: 0.12, borderWidth: 0 });
  page.drawCircle({ x: width * 0.7, y: height * 0.18, size: 50, color: rgb(0.09, 0.63, 0.38), opacity: 0.10, borderWidth: 0 });

  // "DEV ONLY" badge
  page.drawRectangle({ x: 24, y: height - 36, width: 78, height: 18, color: C().amber600 });
  page.drawText('DEV ONLY', { x: 32, y: height - 28, size: 8, font: bold, color: C().white });

  // Logo block
  page.drawRectangle({ x: 40, y: height * 0.60, width: 44, height: 56, color: C().blue600 });
  page.drawText('D', { x: 54, y: height * 0.60 + 18, size: 32, font: bold, color: C().white });

  // Title
  page.drawText('DocCraft', { x: 96, y: height * 0.60 + 32, size: 36, font: bold, color: C().white });
  page.drawText('Benchmark PDF', { x: 96, y: height * 0.60 + 10, size: 16, font: regular, color: rgb(0.7, 0.8, 1.0) });

  // Subtitle
  page.drawText('Feature playground for dev & QA', {
    x: 40, y: height * 0.54, size: 11, font: regular, color: C().slate400,
  });

  // Divider
  page.drawLine({
    start: { x: 40, y: height * 0.50 },
    end:   { x: width - 40, y: height * 0.50 },
    thickness: 1, color: rgb(0.25, 0.30, 0.42),
  });

  // Table of Contents
  page.drawText('Contents', { x: 40, y: height * 0.46, size: 13, font: bold, color: C().white });

  const contents: [string, string, RGBT][] = [
    ['1', 'Cover & Table of Contents', C().blue600],
    ['2', 'Rich Text & Typography',     C().blue600],
    ['3', 'Annotation Showcase',        C().purple600],
    ['4', 'Drawing & Shapes',           C().green600],
    ['5', 'Table & Data Layout',        C().teal600],
    ['6', 'Search & OCR Test Region',   C().amber600],
    ['7', 'Equation & Math Rendering',  C().red600],
    ['8', 'Organize - Multi-Column',    C().slate400],
  ];

  let cy = height * 0.42;
  contents.forEach(([num, label, color]) => {
    // Number badge
    page.drawCircle({ x: 52, y: cy + 6, size: 9, color, borderWidth: 0 });
    page.drawText(num, { x: num.length === 1 ? 49 : 47, y: cy + 2, size: 8, font: bold, color: C().white });

    page.drawText(label, { x: 68, y: cy + 2, size: 9, font: regular, color: C().slate400 });

    // Dotted leader
    let dotX = 68 + regular.widthOfTextAtSize(label, 9) + 6;
    while (dotX < width - 80) {
      page.drawCircle({ x: dotX, y: cy + 5, size: 0.8, color: C().slate700, borderWidth: 0 });
      dotX += 5;
    }
    page.drawText(`pg ${num}`, { x: width - 72, y: cy + 2, size: 8, font: mono, color: C().slate400 });

    cy -= 22;
  });

  // Footer note
  page.drawText('Generated by DocCraft mockPdfGenerator - localhost only', {
    x: 40, y: 30, size: 8, font: mono, color: C().slate700,
  });
}

/** P2 — Rich Text & Typography */
function buildTypography(page: PDFPageT, fonts: Fonts, pn: number, total: number): void {
  const { width, height } = page.getSize();
  const { regular, bold, mono } = fonts;
  const accent = C().blue600;

  headerBar(page, accent, regular, bold, 'Rich Text & Typography', pn, total);
  footerBar(page, regular, 'Page 2 - Typography');

  let y = height - 72;

  sectionHeading(page, bold, 'Heading Hierarchy', y, accent);
  y -= 28;

  const headings: [string, number][] = [
    ['Heading Level 1 - Document Title', 22],
    ['Heading Level 2 - Section Title', 17],
    ['Heading Level 3 - Subsection', 14],
    ['Heading Level 4 - Paragraph heading', 12],
  ];
  headings.forEach(([text, size]) => {
    page.drawText(text, { x: 24, y, size, font: bold, color: C().slate900 });
    y -= size + 8;
  });

  y -= 8;
  page.drawLine({ start: { x: 24, y }, end: { x: width - 24, y }, thickness: 1, color: C().slate200 });
  y -= 18;

  sectionHeading(page, bold, 'Body Text & Paragraph', y, accent);
  y -= 22;

  const body = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt',
    'ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco.',
    '',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla',
    'pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt.',
  ];
  body.forEach((line) => {
    page.drawText(line, { x: 24, y, size: 9, font: regular, color: C().slate700 });
    y -= 14;
  });

  y -= 8;
  page.drawLine({ start: { x: 24, y }, end: { x: width - 24, y }, thickness: 1, color: C().slate200 });
  y -= 18;

  sectionHeading(page, bold, 'Inline Styles', y, accent);
  y -= 22;

  // Simulate bold / italic / mono / strikethrough / underline with coloured annotations
  const samples: [string, RGBT, string][] = [
    ['Bold text weight sample', C().slate900, 'BOLD'],
    ['Monospaced / code: npm run dev --host', C().blue600, 'CODE'],
    ['Highlighted important phrase here', C().amber600, 'HIGHLIGHT'],
    ['Link: https://doccraft.dev/docs', C().blue600, 'LINK'],
  ];

  samples.forEach(([text, color, label]) => {
    badge(page, 24, y, label, bold, color);
    page.drawText(text, { x: 80, y: y + 4, size: 9, font: label === 'CODE' ? mono : regular, color: C().slate900 });
    y -= 22;
  });

  y -= 8;
  page.drawLine({ start: { x: 24, y }, end: { x: width - 24, y }, thickness: 1, color: C().slate200 });
  y -= 18;

  sectionHeading(page, bold, 'Bullet & Numbered Lists', y, accent);
  y -= 22;

  ['Feature parity with desktop browsers', 'Touch-target compliance (>= 44px per WCAG)', 'Safe-area inset support (iPhone notch)'].forEach((item, i) => {
    page.drawCircle({ x: 32, y: y + 4, size: 2.5, color: accent, borderWidth: 0 });
    page.drawText(`${i + 1}.  ${item}`, { x: 40, y, size: 9, font: regular, color: C().slate700 });
    y -= 16;
  });

  y -= 8;
  sectionHeading(page, bold, 'Colours & Swatches', y, accent);
  y -= 24;

  const swatches: [RGBT, string][] = [
    [C().blue600, 'Blue 600'], [C().purple600, 'Purple 600'], [C().green600, 'Green 600'],
    [C().amber600, 'Amber 600'], [C().red600, 'Red 600'], [C().teal600, 'Teal 600'],
  ];
  let sx = 24;
  swatches.forEach(([color, label]) => {
    page.drawRectangle({ x: sx, y: y - 8, width: 56, height: 28, color });
    page.drawText(label, { x: sx + 2, y: y - 12, size: 7, font: regular, color: C().slate700 });
    sx += 64;
  });
}

/** P3 — Annotation Showcase */
function buildAnnotations(page: PDFPageT, fonts: Fonts, pn: number, total: number): void {
  const { width, height } = page.getSize();
  const { regular, bold, mono } = fonts;
  const accent = C().purple600;

  headerBar(page, accent, regular, bold, 'Annotation Showcase', pn, total);
  footerBar(page, regular, 'Page 3 - Annotations');

  let y = height - 72;
  sectionHeading(page, bold, 'Highlight - Text Selection Annotations', y, accent);
  y -= 22;

  // Simulated text blocks with coloured overlays
  const textLine = 'The quick brown fox jumps over the lazy dog near the riverbank.';
  page.drawText(textLine, { x: 24, y, size: 10, font: regular, color: C().slate900 });

  // Highlight overlay
  page.drawRectangle({ x: 24, y: y - 2, width: 148, height: 14, color: C().amber600, opacity: 0.28 });
  badge(page, width - 120, y, 'HIGHLIGHT', bold, C().amber600);
  y -= 24;

  // Underline
  page.drawText(textLine, { x: 24, y, size: 10, font: regular, color: C().slate900 });
  page.drawLine({ start: { x: 24, y: y - 1 }, end: { x: 24 + 210, y: y - 1 }, thickness: 1.5, color: C().blue600 });
  badge(page, width - 120, y, 'UNDERLINE', bold, C().blue600);
  y -= 24;

  // Strikethrough
  page.drawText(textLine, { x: 24, y, size: 10, font: regular, color: C().slate700 });
  page.drawLine({ start: { x: 24, y: y + 4 }, end: { x: 24 + 200, y: y + 4 }, thickness: 1.5, color: C().red600 });
  badge(page, width - 120, y, 'STRIKETHROUGH', bold, C().red600);
  y -= 32;

  page.drawLine({ start: { x: 24, y }, end: { x: width - 24, y }, thickness: 1, color: C().slate200 });
  y -= 16;

  sectionHeading(page, bold, 'Sticky Note', y, accent);
  y -= 22;

  // Note card
  page.drawRectangle({ x: 24, y: y - 40, width: 160, height: 54, color: C().amber100 });
  page.drawRectangle({ x: 24, y: y + 10, width: 160, height: 6, color: C().amber600 });
  page.drawText('Review Note', { x: 30, y: y + 12, size: 8, font: bold, color: C().amber600 });
  page.drawText('This paragraph needs a citation.', { x: 30, y: y - 8, size: 8, font: regular, color: C().slate700 });
  page.drawText('Verify with the primary source.', { x: 30, y: y - 22, size: 8, font: regular, color: C().slate700 });
  page.drawText('— Jane Doe', { x: 30, y: y - 36, size: 7, font: mono, color: C().slate400 });
  y -= 72;

  page.drawLine({ start: { x: 24, y }, end: { x: width - 24, y }, thickness: 1, color: C().slate200 });
  y -= 16;

  sectionHeading(page, bold, 'Callout / Redaction / Stamp', y, accent);
  y -= 24;

  // Redaction box
  page.drawRectangle({ x: 24, y: y - 16, width: 140, height: 24, color: C().black });
  page.drawText('********* REDACTED *********', { x: 30, y: y - 8, size: 9, font: bold, color: C().white });
  badge(page, width - 120, y - 8, 'REDACTION', bold, C().black);
  y -= 48;

  // Stamp
  page.drawRectangle({ x: 24, y: y - 22, width: 110, height: 30, color: C().white, borderColor: C().red600, borderWidth: 2 });
  page.drawText('APPROVED', { x: 36, y: y - 10, size: 14, font: bold, color: C().red600, rotate: degrees(0) });
  badge(page, width - 120, y - 10, 'STAMP', bold, C().red600);
  y -= 56;

  // Callout shape
  page.drawRectangle({ x: 24, y: y - 30, width: 180, height: 36, color: C().blue100, borderColor: C().blue600, borderWidth: 1.5 });
  page.drawText('This is a callout annotation', { x: 30, y: y - 12, size: 9, font: regular, color: C().blue600 });
  page.drawText('pointing to a specific element.', { x: 30, y: y - 24, size: 9, font: regular, color: C().blue600 });
  // Callout tail
  page.drawLine({ start: { x: 60, y: y - 30 }, end: { x: 80, y: y - 46 }, thickness: 1.5, color: C().blue600 });
  page.drawLine({ start: { x: 80, y: y - 46 }, end: { x: 110, y: y - 30 }, thickness: 1.5, color: C().blue600 });
}

/** P4 — Drawing & Shapes */
function buildDrawing(page: PDFPageT, fonts: Fonts, pn: number, total: number): void {
  const { width, height } = page.getSize();
  const { regular, bold } = fonts;
  const accent = C().green600;

  headerBar(page, accent, regular, bold, 'Drawing & Shapes', pn, total);
  footerBar(page, regular, 'Page 4 - Drawing');

  let y = height - 72;
  sectionHeading(page, bold, 'Shape Library', y, accent);
  y -= 24;

  // Grid of shapes
  const shapes: Array<{ label: string; draw: () => void }> = [
    {
      label: 'Rectangle',
      draw: () => page.drawRectangle({ x: 28, y: y - 50, width: 70, height: 44, color: C().blue100, borderColor: C().blue600, borderWidth: 2 }),
    },
    {
      label: 'Ellipse',
      draw: () => page.drawEllipse({ x: 145, y: y - 28, xScale: 36, yScale: 22, color: C().green100, borderColor: C().green600, borderWidth: 2 }),
    },
    {
      label: 'Rounded Rect',
      draw: () => page.drawRectangle({ x: 200, y: y - 50, width: 70, height: 44, color: C().purple100, borderColor: C().purple600, borderWidth: 2 }),
    },
    {
      label: 'Circle',
      draw: () => page.drawCircle({ x: 310, y: y - 28, size: 22, color: C().teal100, borderColor: C().teal600, borderWidth: 2 }),
    },
    {
      label: 'Diamond',
      draw: () => {
        const cx = 370, cy = y - 28, s = 22;
        page.drawLine({ start: { x: cx, y: cy + s }, end: { x: cx + s, y: cy }, thickness: 2, color: C().amber600 });
        page.drawLine({ start: { x: cx + s, y: cy }, end: { x: cx, y: cy - s }, thickness: 2, color: C().amber600 });
        page.drawLine({ start: { x: cx, y: cy - s }, end: { x: cx - s, y: cy }, thickness: 2, color: C().amber600 });
        page.drawLine({ start: { x: cx - s, y: cy }, end: { x: cx, y: cy + s }, thickness: 2, color: C().amber600 });
      },
    },
  ];
  shapes.forEach(({ draw }) => draw());

  // Labels
  const labelXs = [28, 120, 200, 294, 348];
  ['Rectangle', 'Ellipse', 'Round Rect', 'Circle', 'Diamond'].forEach((l, i) => {
    page.drawText(l, { x: labelXs[i]!, y: y - 64, size: 7, font: regular, color: C().slate400 });
  });

  y -= 84;
  page.drawLine({ start: { x: 24, y }, end: { x: width - 24, y }, thickness: 1, color: C().slate200 });
  y -= 16;

  sectionHeading(page, bold, 'Line & Arrow Styles', y, accent);
  y -= 24;

  const lineStyles: Array<{ label: string; dash?: number[]; color: RGBT; width: number }> = [
    { label: 'Solid — 1px',       color: C().slate900, width: 1 },
    { label: 'Solid — 2px',       color: C().slate900, width: 2 },
    { label: 'Dashed',            color: C().blue600,  width: 1.5, dash: [6, 3] },
    { label: 'Dotted',            color: C().purple600, width: 1.5, dash: [2, 3] },
    { label: 'Thick accent',      color: C().green600, width: 4 },
  ];
  lineStyles.forEach(({ label, color, width }) => {
    page.drawLine({ start: { x: 24, y }, end: { x: width * 0.55, y }, thickness: width, color, lineCap: lib().LineCapStyle.Round });
    page.drawText(label, { x: width * 0.57, y: y - 3, size: 8, font: regular, color: C().slate700 });
    y -= 18;
  });

  // Arrow
  page.drawLine({ start: { x: 24, y }, end: { x: 160, y }, thickness: 2, color: C().red600 });
  page.drawLine({ start: { x: 160, y }, end: { x: 150, y: y + 6 }, thickness: 2, color: C().red600 });
  page.drawLine({ start: { x: 160, y }, end: { x: 150, y: y - 6 }, thickness: 2, color: C().red600 });
  page.drawText('Arrow annotation', { x: 168, y: y - 3, size: 8, font: regular, color: C().slate700 });
  y -= 28;

  page.drawLine({ start: { x: 24, y }, end: { x: width - 24, y }, thickness: 1, color: C().slate200 });
  y -= 16;

  sectionHeading(page, bold, 'Free-draw / Ink Strokes', y, accent);
  y -= 24;

  // Simulate ink path with series of short lines
  const inkPoints: [number, number][] = [
    [28, y], [35, y - 8], [42, y - 4], [50, y - 12], [58, y - 6],
    [66, y - 14], [74, y - 4], [82, y - 10], [90, y - 2], [98, y - 8],
    [106, y - 3], [114, y - 11], [122, y - 5], [130, y - 9], [138, y - 2],
  ];
  for (let i = 0; i < inkPoints.length - 1; i++) {
    page.drawLine({
      start: { x: inkPoints[i]![0], y: inkPoints[i]![1] },
      end:   { x: inkPoints[i + 1]![0], y: inkPoints[i + 1]![1] },
      thickness: 2,
      color: C().purple600,
      lineCap: lib().LineCapStyle.Round,
    });
  }
  page.drawText('<- Free-draw ink stroke (Draw mode)', { x: 148, y: y - 8, size: 8, font: regular, color: C().slate400 });

  y -= 40;
  sectionHeading(page, bold, 'Opacity & Blending', y, accent);
  y -= 24;

  [0.2, 0.4, 0.6, 0.8, 1.0].forEach((opacity, i) => {
    page.drawRectangle({ x: 24 + i * 66, y: y - 30, width: 60, height: 30, color: C().blue600, opacity, borderWidth: 0 });
    page.drawText(`${Math.round(opacity * 100)}%`, {
      x: 24 + i * 66 + 20, y: y - 22, size: 8, font: bold, color: C().white,
    });
  });
}

/** P5 — Table & Data Layout */
function buildTable(page: PDFPageT, fonts: Fonts, pn: number, total: number): void {
  const { width, height } = page.getSize();
  const { regular, bold, mono } = fonts;
  const accent = C().teal600;

  headerBar(page, accent, regular, bold, 'Table & Data Layout', pn, total);
  footerBar(page, regular, 'Page 5 - Tables');

  let y = height - 72;
  sectionHeading(page, bold, 'Feature Benchmark Matrix', y, accent);
  y -= 4;

  const colW = [130, 80, 90, 90, 90];
  const headerRow = ['Feature', 'Priority', 'Mobile', 'Desktop', 'Status'];
  row(page, bold, y - 18, headerRow, colW, true, C().teal600);
  // Header text colour fix — re-draw in white
  let hx = 24;
  headerRow.forEach((h, i) => {
    page.drawText(h, { x: hx + 4, y: y - 13, size: 8, font: bold, color: C().white });
    hx += colW[i]!;
  });
  y -= 18;

  const dataRows: [string, string, string, string, string, boolean][] = [
    ['PDF Render (PDF.js)',  'High',   'Yes', 'Yes', 'Complete',    false],
    ['Text Highlight',       'High',   'Yes', 'Yes', 'Complete',    true],
    ['Sticky Note',          'High',   'Yes', 'Yes', 'Complete',    false],
    ['Free Draw / Ink',      'Medium', 'Yes', 'Yes', 'Complete',    true],
    ['Shapes (rect/ellipse)','Medium', 'Yes', 'Yes', 'Complete',    false],
    ['Equation (pix2tex)',   'Medium', 'No',  'Yes', 'In Progress', true],
    ['Server OCR',           'High',   'No',  'Yes', 'Planned',     false],
    ['Organize Pages',       'Medium', 'Yes', 'Yes', 'Complete',    true],
    ['Macro Builder',        'Low',    'No',  'Yes', 'Complete',    false],
    ['Search & Index',       'High',   'Yes', 'Yes', 'Complete',    true],
    ['Export / Save',        'High',   'Yes', 'Yes', 'Complete',    false],
    ['Annotation Autosave',  'High',   'Yes', 'Yes', 'Complete',    true],
  ];

  dataRows.forEach(([feat, pri, mob, desk, status, shade]) => {
    const bg = shade ? C().slate100 : C().white;
    const statusColor = status === 'Complete' ? C().green600 : status === 'In Progress' ? C().amber600 : C().slate400;
    row(page, regular, y - 18, [feat, pri, mob, desk, ''], colW, false, bg);

    // Status pill
    const statusX = 24 + colW[0]! + colW[1]! + colW[2]! + colW[3]!;
    pill(page, statusX + 4, y - 15, colW[4]! - 8, 12, statusColor, status, bold, 7);

    y -= 18;
  });

  // Border around table
  const tableH = (dataRows.length + 1) * 18;
  const tableW = colW.reduce((a, b) => a + b, 0);
  const tableTop = height - 72 - 22;
  page.drawRectangle({ x: 24, y: tableTop - tableH, width: tableW, height: tableH, borderColor: C().slate200, borderWidth: 1, color: rgb(0, 0, 0), opacity: 0 });

  // Column separators
  let cx = 24;
  colW.slice(0, -1).forEach((w) => {
    cx += w;
    page.drawLine({ start: { x: cx, y: tableTop - tableH }, end: { x: cx, y: tableTop }, thickness: 0.5, color: C().slate200 });
  });

  y -= 24;
  sectionHeading(page, bold, 'Key  /  Legend', y, accent);
  y -= 18;

  [['Yes  Supported', C().green600], ['No  Not applicable', C().slate400], ['High / Medium / Low - feature priority ranking', C().slate700]].forEach(([text, color]) => {
    page.drawText(text as string, { x: 24, y, size: 8, font: regular, color: color as RGBT });
    y -= 14;
  });

  // Mono code block
  y -= 8;
  page.drawRectangle({ x: 24, y: y - 28, width: width - 48, height: 36, color: C().slate900 });
  page.drawText('$ pnpm test --run  ->  592 passed | 1 skipped', {
    x: 32, y: y - 8, size: 9, font: mono, color: C().green600,
  });
  page.drawText('$ pnpm build       ->  [x] built in 1.96s', {
    x: 32, y: y - 22, size: 9, font: mono, color: C().slate400,
  });
}

/** P6 — Search & OCR Test Region */
function buildSearch(page: PDFPageT, fonts: Fonts, pn: number, total: number): void {
  const { width, height } = page.getSize();
  const { regular, bold, mono } = fonts;
  const accent = C().amber600;

  headerBar(page, accent, regular, bold, 'Search & OCR Test Region', pn, total);
  footerBar(page, regular, 'Page 6 - Search / OCR');

  let y = height - 72;
  sectionHeading(page, bold, 'Searchable Text Corpus', y, accent);
  y -= 20;

  // Dense text for search testing
  const searchParagraphs = [
    'The Schrödinger equation is a linear partial differential equation that governs the wave function',
    'of a quantum-mechanical system. It was formulated in late 1925, and published in 1926. The equation',
    'describes how the quantum state of a physical system changes over time.',
    '',
    'Newton\'s laws of motion are three basic laws of classical mechanics. They describe the relationship',
    'between the motion of an object and the forces acting on it. First Law: an object at rest stays at rest.',
    'Second Law: F = ma. Third Law: for every action there is an equal and opposite reaction.',
    '',
    'DocCraft search index processes text at the page level using a trigram inverted index. Queries support',
    'case-insensitive matching, whole-word mode, and regular expressions (RegExp). The indexer runs once',
    'per document load and caches results by SHA-256 document key.',
    '',
    'Search term targets (try these): algorithm, quantum, Newton, DocCraft, SHA-256, trigram, RegExp.',
  ];
  searchParagraphs.forEach((line) => {
    if (!line) { y -= 8; return; }
    page.drawText(line, { x: 24, y, size: 8.5, font: regular, color: C().slate700 });
    y -= 13;
  });

  // Highlight a search term
  page.drawRectangle({ x: 66, y: y + 166, width: 48, height: 11, color: C().amber600, opacity: 0.35 });

  y -= 16;
  page.drawLine({ start: { x: 24, y }, end: { x: width - 24, y }, thickness: 1, color: C().slate200 });
  y -= 16;

  sectionHeading(page, bold, 'OCR Test Region - Raster-Only Text', y, accent);
  y -= 16;

  page.drawText('The following block simulates a scanned region that requires OCR.', {
    x: 24, y, size: 8, font: regular, color: C().slate400,
  });
  y -= 18;

  // Simulate a raster-only block with a grey box + rendered text at slight angle
  page.drawRectangle({ x: 24, y: y - 80, width: width - 48, height: 90, color: C().slate100, borderColor: C().slate200, borderWidth: 1 });
  page.drawRectangle({ x: 30, y: y - 76, width: 80, height: 12, color: C().slate400 }); // simulated scan artefact bar

  const ocrLines = [
    'Invoice No: INV-2026-0042',
    'Date:       2026-05-31',
    'Amount:     USD 1,250.00',
    'Status:     PAID',
    'Vendor:     Acme Corp Ltd.',
  ];
  ocrLines.forEach((line, i) => {
    page.drawText(line, {
      x: 30, y: y - 20 - i * 12,
      size: 8.5, font: mono, color: C().slate900,
      rotate: degrees(-0.3), // slight scan skew
    });
  });

  badge(page, width - 120, y - 30, 'OCR TARGET', bold, C().amber600);

  y -= 108;
  sectionHeading(page, bold, 'Low-Confidence Region (Noise)', y, accent);
  y -= 18;

  page.drawRectangle({ x: 24, y: y - 50, width: width - 48, height: 60, color: C().red100, borderColor: C().red600, borderWidth: 1 });
  const noisy = '7h1$ t3xt 1$ int3nt10n@lly d3gr@d3d t0 t3$t l0w-c0nfid3nc3 0CR p@th$.';
  page.drawText(noisy, { x: 30, y: y - 18, size: 9, font: mono, color: C().slate700 });
  page.drawText('Expected: Tesseract confidence < 0.3 -> low-confidence warning banner shown.', {
    x: 30, y: y - 36, size: 7.5, font: regular, color: C().red600,
  });
  badge(page, width - 150, y - 18, 'LOW CONFIDENCE', bold, C().red600);
}

/** P7 — Equation & Math */
function buildEquations(page: PDFPageT, fonts: Fonts, pn: number, total: number): void {
  const { width, height } = page.getSize();
  const { regular, bold, mono } = fonts;
  const accent = C().red600;

  headerBar(page, accent, regular, bold, 'Equation & Math Rendering', pn, total);
  footerBar(page, regular, 'Page 7 - Equations');

  let y = height - 72;
  sectionHeading(page, bold, 'LaTeX Equations (MathJax SVG target)', y, accent);
  y -= 22;

  const equations: [string, string][] = [
    ['Euler\'s identity',       'e^{i\\pi} + 1 = 0'],
    ['Quadratic formula',       'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'],
    ['Gaussian integral',       '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}'],
    ['Maxwell\'s equation',     '\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}'],
    ['Schrödinger (TDSE)',      'i\\hbar\\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi'],
    ['Taylor series',           'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n'],
    ['Navier-Stokes (fluid)',   '\\rho\\left(\\frac{\\partial v}{\\partial t}+(v\\cdot\\nabla)v\\right) = -\\nabla p + \\mu\\nabla^2 v'],
  ];

  equations.forEach(([name, latex]) => {
    // Label
    page.drawText(name, { x: 24, y: y + 2, size: 8, font: bold, color: C().slate700 });

    // LaTeX box (simulates the rendered SVG region)
    page.drawRectangle({ x: 24, y: y - 22, width: width - 48, height: 26, color: C().red100, borderColor: C().red600, borderWidth: 1, opacity: 0.6 });
    page.drawText(latex, { x: 30, y: y - 14, size: 9, font: mono, color: C().slate900 });
    badge(page, width - 90, y - 14, 'LaTeX', bold, C().red600);

    y -= 44;
  });

  y -= 4;
  page.drawLine({ start: { x: 24, y }, end: { x: width - 24, y }, thickness: 1, color: C().slate200 });
  y -= 16;

  sectionHeading(page, bold, 'Equation Correction Entry Point (INV-8)', y, accent);
  y -= 20;

  // Simulates a failed equation with edit button
  page.drawRectangle({ x: 24, y: y - 36, width: width - 48, height: 44, color: C().amber100, borderColor: C().amber600, borderWidth: 1.5 });
  page.drawText('[!]  pix2tex returned empty - raw LaTeX shown for manual correction:', {
    x: 30, y: y - 8, size: 8, font: bold, color: C().amber600,
  });
  page.drawText('\\frac{d}{dx}\\left[\\int_{a}^{x} f(t)dt\\right] = f(x)  <- edit me', {
    x: 30, y: y - 24, size: 8.5, font: mono, color: C().slate900,
  });
  pill(page, width - 90, y - 22, 60, 18, C().amber600, '[Edit]', bold, 8);
}

/** P8 — Organize & Multi-column */
function buildOrganize(page: PDFPageT, fonts: Fonts, pn: number, total: number): void {
  const { width, height } = page.getSize();
  const { regular, bold, mono } = fonts;
  const accent = C().slate400;

  headerBar(page, accent, regular, bold, 'Organize - Multi-Column Layout', pn, total);
  footerBar(page, regular, 'Page 8 - Organize');

  let y = height - 72;
  sectionHeading(page, bold, 'Page Management Panel Simulation', y, accent);
  y -= 20;

  // Simulate thumbnail strip
  const thumbW = 68, thumbH = 88, cols = 6, gap = 10;
  const startX = (width - (cols * thumbW + (cols - 1) * gap)) / 2;

  Array.from({ length: cols }).forEach((_, i) => {
    const tx = startX + i * (thumbW + gap);
    const ty = y - thumbH;
    // Page thumbnail card
    page.drawRectangle({ x: tx, y: ty, width: thumbW, height: thumbH, color: C().white, borderColor: i === 2 ? C().blue600 : C().slate200, borderWidth: i === 2 ? 2 : 1, opacity: 1 });
    // Simulated content lines
    [70, 60, 50, 40, 30, 20].forEach((lineY, j) => {
      page.drawRectangle({ x: tx + 6, y: ty + lineY - 10, width: thumbW - 12 - (j % 2 === 0 ? 8 : 16), height: 4, color: C().slate200 });
    });
    // Page number
    page.drawText(`${i + 1}`, { x: tx + thumbW / 2 - 3, y: ty - 12, size: 8, font: regular, color: i === 2 ? C().blue600 : C().slate400 });
    // "Selected" badge on page 3
    if (i === 2) {
      page.drawCircle({ x: tx + thumbW - 10, y: ty + thumbH - 10, size: 7, color: C().blue600, borderWidth: 0 });
      page.drawText('*', { x: tx + thumbW - 12, y: ty + thumbH - 16, size: 8, font: bold, color: C().white });
    }
  });
  y -= thumbH + 28;

  page.drawLine({ start: { x: 24, y }, end: { x: width - 24, y }, thickness: 1, color: C().slate200 });
  y -= 16;

  sectionHeading(page, bold, 'Two-Column Text Layout', y, accent);
  y -= 20;

  const col1X = 24, col2X = width / 2 + 8;
  const colWidth = width / 2 - 32;
  const colLines = [
    'Column layouts are useful for',
    'document comparison, side-by-side',
    'review workflows, and multi-lingual',
    'content. DocCraft\'s organize mode',
    'supports drag-reorder and multi-',
    'select page operations.',
    '',
    'Pages can be moved, duplicated,',
    'deleted, or rotated in bulk.',
    'The organize panel streams all',
    'thumbnails lazily for performance.',
  ];

  let cy = y;
  colLines.forEach((line, i) => {
    const inCol2 = i >= Math.ceil(colLines.length / 2);
    const x = inCol2 ? col2X : col1X;
    const baseY = inCol2 ? y - (i - Math.ceil(colLines.length / 2)) * 14 : cy;
    if (!line) { cy -= 8; return; }
    page.drawText(line, { x, y: inCol2 ? baseY : cy, size: 8.5, font: regular, color: C().slate700, maxWidth: colWidth });
    if (!inCol2) cy -= 14;
  });

  // Column divider
  page.drawLine({
    start: { x: width / 2, y: y + 4 },
    end:   { x: width / 2, y: y - colLines.length * 7 - 8 },
    thickness: 0.5, color: C().slate200,
  });

  y -= 120;
  page.drawLine({ start: { x: 24, y }, end: { x: width - 24, y }, thickness: 1, color: C().slate200 });
  y -= 16;

  sectionHeading(page, bold, 'Performance Benchmarks', y, accent);
  y -= 20;

  const benchmarks: [string, string, string][] = [
    ['Mobile shell mount',         '<= 50 ms',  'budget'],
    ['Drawer open animation',      '<= 300 ms', 'budget'],
    ['Sheet open animation',       '<= 300 ms', 'budget'],
    ['Touch target minimum',       '44 x 44px', 'WCAG 2.5.8'],
    ['Bundle size delta (mobile)', '<= 5 KB gz','verified'],
    ['Test suite (total)',         '592 pass', '1 skipped'],
    ['TypeScript errors',          '0',        'strict mode'],
    ['ESLint violations',          '0',        'no-console'],
  ];

  const bColW = [190, 100, 120];
  // Header
  page.drawRectangle({ x: 24, y, width: bColW.reduce((a, b) => a + b, 0), height: 18, color: C().slate900 });
  ['Metric', 'Budget / Result', 'Notes'].forEach((h, i) => {
    page.drawText(h, { x: 24 + bColW.slice(0, i).reduce((a, b) => a + b, 0) + 4, y: y + 5, size: 8, font: bold, color: C().white });
  });
  y -= 18;

  benchmarks.forEach(([metric, result, note], idx) => {
    const bg = idx % 2 === 0 ? C().white : C().slate100;
    page.drawRectangle({ x: 24, y, width: bColW.reduce((a, b) => a + b, 0), height: 16, color: bg });
    page.drawText(metric, { x: 28, y: y + 4, size: 8, font: regular, color: C().slate700 });
    page.drawText(result, { x: 24 + bColW[0]! + 4, y: y + 4, size: 8, font: mono, color: C().green600 });
    page.drawText(note,   { x: 24 + bColW[0]! + bColW[1]! + 4, y: y + 4, size: 8, font: regular, color: C().slate400 });
    y -= 16;
  });
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

interface Fonts {
  regular: PDFFontT;
  bold: PDFFontT;
  mono: PDFFontT;
}

/**
 * Generates the benchmark PDF and returns its bytes.
 * Call from a hook; never call on the main thread synchronously.
 */
export async function generateMockPdf(): Promise<Uint8Array> {
  await ensurePdfLibLoaded();
  const { PDFDocument, StandardFonts } = lib();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('DocCraft Benchmark PDF');
  pdfDoc.setAuthor('DocCraft mockPdfGenerator');
  pdfDoc.setSubject('Dev-only feature playground');
  pdfDoc.setKeywords(['doccraft', 'benchmark', 'dev', 'mock', 'pdf']);
  pdfDoc.setCreator('DocCraft · localhost');

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold     = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const mono     = await pdfDoc.embedFont(StandardFonts.Courier);
  const fonts: Fonts = { regular, bold, mono };

  const W = 595.28; // A4 width  (pt)
  const H = 841.89; // A4 height (pt)
  const total = 8;

  const builders: Array<(page: PDFPageT, fonts: Fonts, pn: number, total: number) => void> = [
    (_page, _fonts) => buildCover(_page, _fonts),
    buildTypography,
    buildAnnotations,
    buildDrawing,
    buildTable,
    buildSearch,
    buildEquations,
    buildOrganize,
  ];

  builders.forEach((build, i) => {
    const page = pdfDoc.addPage([W, H]);
    build(page, fonts, i + 1, total);
  });

  return pdfDoc.save();
}
