import { PdfRendererAdapter, type TextLayerItem } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { MacroRecipe, MacroStep, PageSelector } from '@/core/macro/types';
import type { PsIsonoteMapping } from './psIsonoteTable';
import { normalizePsNumber } from './psIsonoteTable';

export type PsIsonotePlacement = 'auto' | 'right' | 'left';

export interface PsIsonoteTextReference {
  psNo: string;
  pageNumber: number;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  mapping: PsIsonoteMapping;
}

export interface PsIsonoteScanResult {
  references: PsIsonoteTextReference[];
  missingPsNumbers: string[];
  skippedExisting: Array<{ psNo: string; pageNumber: number }>;
  scannedPages: number[];
  pageDimensions: Record<number, { width: number; height: number }>;
}

export interface PsIsonoteScanOptions {
  selector: PageSelector;
  currentPage?: number;
  selectedPages?: number[];
  skipExisting?: boolean;
}

export interface PsIsonoteRecipeOptions {
  placement?: PsIsonotePlacement;
  noteWidth?: number;
  fontSize?: number;
  gap?: number;
  pageMargin?: number;
  includeFamily?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
}

export interface PlannedPsIsonoteCallout extends PsIsonoteTextReference {
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

const PS_REFERENCE_PATTERN = /\bP\s*S\s*[-‐‑‒–—−]\s*[0-9]{2,12}(?:\s*\.\s*[A-Z0-9]{1,6})?\b/gi;

function markerForPs(psNo: string): string {
  return `PDFHUBISONOTE[${psNo.replace(/^PS-/, '')}]`;
}

function normalizeMarkerText(text: string): string {
  return text.toUpperCase().replace(/\s+/g, '');
}

function unionRects(items: TextLayerItem[]): PsIsonoteTextReference['rect'] | null {
  if (items.length === 0) return null;
  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.width));
  const bottom = Math.max(...items.map((item) => item.y + item.height));
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function findPsIsonoteReferencesInTextItems(
  items: TextLayerItem[],
  mappings: PsIsonoteMapping[],
  pageNumber = 1,
): PsIsonoteTextReference[] {
  const mappingByPs = new Map(mappings.map((mapping) => [mapping.psNo, mapping]));
  let fullText = '';
  const itemSpans: Array<{ start: number; end: number; item: TextLayerItem }> = [];

  for (const item of items) {
    const start = fullText.length;
    fullText += item.text;
    const end = fullText.length;
    itemSpans.push({ start, end, item });
    fullText += ' ';
  }

  const references: PsIsonoteTextReference[] = [];
  PS_REFERENCE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = PS_REFERENCE_PATTERN.exec(fullText)) !== null) {
    const psNo = normalizePsNumber(match[0]);
    if (!psNo) continue;
    const mapping = mappingByPs.get(psNo);
    if (!mapping) continue;

    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    const matchedItems = itemSpans
      .filter((span) => span.start < matchEnd && span.end > matchStart)
      .map((span) => span.item);
    const rect = unionRects(matchedItems);
    if (!rect) continue;

    references.push({ psNo, pageNumber, rect, mapping });
  }

  return references;
}

function resolvePageNumbers(
  selector: PageSelector,
  pageCount: number,
  currentPage: number | undefined,
  selectedPages: number[],
): number[] {
  const allPages = Array.from({ length: pageCount }, (_, index) => index + 1);
  switch (selector.mode) {
    case 'all':
      return allPages;
    case 'current':
      return currentPage && currentPage >= 1 && currentPage <= pageCount ? [currentPage] : [];
    case 'selected':
      return Array.from(new Set(selectedPages)).filter((page) => page >= 1 && page <= pageCount).sort((a, b) => a - b);
    case 'range': {
      const from = Math.max(1, Math.min(selector.from, selector.to));
      const to = Math.min(pageCount, Math.max(selector.from, selector.to));
      return allPages.filter((page) => page >= from && page <= to);
    }
    case 'list':
      return Array.from(new Set(selector.pages)).filter((page) => page >= 1 && page <= pageCount).sort((a, b) => a - b);
    case 'odd':
      return allPages.filter((page) => page % 2 === 1);
    case 'even':
      return allPages.filter((page) => page % 2 === 0);
  }
}

export async function scanPsIsonoteReferences(
  bytes: Uint8Array,
  mappings: PsIsonoteMapping[],
  options: PsIsonoteScanOptions,
): Promise<PsIsonoteScanResult> {
  const doc = await PdfRendererAdapter.loadDocument(bytes);
  const scannedPages = resolvePageNumbers(
    options.selector,
    doc.numPages,
    options.currentPage,
    options.selectedPages ?? [],
  );
  const references: PsIsonoteTextReference[] = [];
  const skippedExisting: Array<{ psNo: string; pageNumber: number }> = [];
  const pageDimensions: Record<number, { width: number; height: number }> = {};
  const foundPsNumbers = new Set<string>();

  for (const pageNumber of scannedPages) {
    const page = await doc.getPage(pageNumber);
    try {
      const items = await PdfRendererAdapter.getPageTextItems(page, 1);
      pageDimensions[pageNumber] = PdfRendererAdapter.getPageDimensions(page);
      const normalizedPageText = normalizeMarkerText(items.map((item) => item.text).join(' '));
      const pageReferences = findPsIsonoteReferencesInTextItems(items, mappings, pageNumber);

      for (const reference of pageReferences) {
        const marker = normalizeMarkerText(markerForPs(reference.psNo));
        if (options.skipExisting !== false && normalizedPageText.includes(marker)) {
          foundPsNumbers.add(reference.psNo);
          if (!skippedExisting.some((item) => item.psNo === reference.psNo && item.pageNumber === pageNumber)) {
            skippedExisting.push({ psNo: reference.psNo, pageNumber });
          }
          continue;
        }
        references.push(reference);
        foundPsNumbers.add(reference.psNo);
      }
    } finally {
      page.cleanup();
    }
  }

  const missingPsNumbers = mappings
    .map((mapping) => mapping.psNo)
    .filter((psNo) => !foundPsNumbers.has(psNo));

  return {
    references,
    missingPsNumbers,
    skippedExisting,
    scannedPages,
    pageDimensions,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

function boxesOverlap(
  left: PlannedPsIsonoteCallout['box'],
  right: PlannedPsIsonoteCallout['box'],
  clearance: number,
): boolean {
  return !(
    left.x + left.width + clearance <= right.x ||
    right.x + right.width + clearance <= left.x ||
    left.y + left.height + clearance <= right.y ||
    right.y + right.height + clearance <= left.y
  );
}

function estimateCalloutHeight(
  mapping: PsIsonoteMapping,
  width: number,
  fontSize: number,
  includeFamily: boolean,
): number {
  const padding = 8;
  const usableWidth = Math.max(40, width - padding * 2);
  const charactersPerLine = Math.max(12, Math.floor(usableWidth / Math.max(4, fontSize * 0.55)));
  const noteLines = Math.max(1, Math.ceil(mapping.isonote.length / charactersPerLine));
  const familyLines = includeFamily && mapping.family ? 1 : 0;
  const totalLines = 1 + familyLines + noteLines;
  return Math.max(52, Math.ceil(padding * 2 + totalLines * fontSize * 1.35 + 4));
}

function chooseInitialBox(
  reference: PsIsonoteTextReference,
  dimensions: { width: number; height: number },
  width: number,
  height: number,
  placement: PsIsonotePlacement,
  gap: number,
  margin: number,
): PlannedPsIsonoteCallout['box'] {
  const rightX = reference.rect.x + reference.rect.width + gap;
  const leftX = reference.rect.x - gap - width;
  const canUseRight = rightX + width <= dimensions.width - margin;
  const canUseLeft = leftX >= margin;

  let x: number;
  if (placement === 'right') {
    x = canUseRight ? rightX : canUseLeft ? leftX : dimensions.width - margin - width;
  } else if (placement === 'left') {
    x = canUseLeft ? leftX : canUseRight ? rightX : margin;
  } else {
    x = canUseRight ? rightX : canUseLeft ? leftX : clamp(reference.rect.x, margin, dimensions.width - margin - width);
  }

  const y = clamp(
    reference.rect.y + reference.rect.height / 2 - height / 2,
    margin,
    Math.max(margin, dimensions.height - margin - height),
  );

  return { x, y, width, height };
}

export function planPsIsonoteCallouts(
  scan: PsIsonoteScanResult,
  options: PsIsonoteRecipeOptions = {},
): PlannedPsIsonoteCallout[] {
  const placement = options.placement ?? 'auto';
  const configuredWidth = options.noteWidth ?? 220;
  const fontSize = options.fontSize ?? 10;
  const gap = options.gap ?? 8;
  const margin = options.pageMargin ?? 12;
  const includeFamily = options.includeFamily ?? true;
  const planned: PlannedPsIsonoteCallout[] = [];
  const byPage = new Map<number, PlannedPsIsonoteCallout[]>();

  const sorted = [...scan.references].sort((left, right) =>
    left.pageNumber - right.pageNumber || left.rect.y - right.rect.y || left.rect.x - right.rect.x,
  );

  for (const reference of sorted) {
    const dimensions = scan.pageDimensions[reference.pageNumber];
    if (!dimensions) continue;
    const width = clamp(configuredWidth, 120, Math.max(120, dimensions.width - margin * 2));
    const height = estimateCalloutHeight(reference.mapping, width, fontSize, includeFamily);
    const box = chooseInitialBox(reference, dimensions, width, height, placement, gap, margin);
    const pageBoxes = byPage.get(reference.pageNumber) ?? [];

    let attempts = 0;
    while (pageBoxes.some((existing) => boxesOverlap(box, existing.box, 4)) && attempts < 80) {
      box.y += 8;
      if (box.y + box.height > dimensions.height - margin) {
        box.y = margin + (attempts % 4) * 4;
        box.x = clamp(box.x - width - gap, margin, dimensions.width - margin - width);
      }
      attempts += 1;
    }

    const callout = { ...reference, box };
    pageBoxes.push(callout);
    byPage.set(reference.pageNumber, pageBoxes);
    planned.push(callout);
  }

  return planned;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildCalloutHtml(mapping: PsIsonoteMapping, includeFamily: boolean): string {
  const family = includeFamily && mapping.family
    ? `<div style="font-size:0.86em;opacity:0.78;margin-top:2px">Family: ${escapeHtml(mapping.family)}</div>`
    : '';
  return [
    `<div><strong>${escapeHtml(mapping.psNo)} - ISONOTE</strong></div>`,
    family,
    `<div style="margin-top:4px">${escapeHtml(mapping.isonote)}</div>`,
  ].join('');
}

export function buildPsIsonoteAnnotationRecipe(
  scan: PsIsonoteScanResult,
  options: PsIsonoteRecipeOptions = {},
): { recipe: MacroRecipe; callouts: PlannedPsIsonoteCallout[] } {
  const callouts = planPsIsonoteCallouts(scan, options);
  const fontSize = options.fontSize ?? 10;
  const includeFamily = options.includeFamily ?? true;
  const steps: MacroStep[] = callouts.map((callout) => ({
    op: 'place_rich_textbox',
    selector: { mode: 'list', pages: [callout.pageNumber] },
    x: callout.box.x,
    y: callout.box.y,
    width: callout.box.width,
    height: callout.box.height,
    content: buildCalloutHtml(callout.mapping, includeFamily),
    styles: {
      fontSize,
      fontFamily: 'Arial, Helvetica, sans-serif',
      color: options.textColor ?? '#7c2d12',
      backgroundColor: options.backgroundColor ?? '#fff7ed',
      padding: 8,
      opacity: 0.96,
      borderWidth: 1,
      borderColor: options.borderColor ?? '#c2410c',
      lineHeight: 1.25,
      textAlign: 'left',
    },
  }));

  const markerKeys = Array.from(new Set(callouts.map((callout) => `${callout.pageNumber}|${callout.psNo}`)));
  markerKeys.forEach((key, markerIndex) => {
    const [pageNumberText, psNo] = key.split('|');
    steps.push({
      op: 'draw_text_on_pages',
      selector: { mode: 'list', pages: [Number(pageNumberText)] },
      text: markerForPs(psNo),
      x: 2,
      y: 2 + markerIndex * 0.15,
      fontSize: 0.1,
      color: '#ffffff',
      opacity: 0.01,
      align: 'left',
      pageNumberToken: false,
      fileNameToken: false,
      dateToken: false,
    });
  });

  return {
    recipe: {
      id: `ps_isonote_annotation_${Date.now()}`,
      name: 'Annotate PS ISONOTEs',
      steps,
    },
    callouts,
  };
}
