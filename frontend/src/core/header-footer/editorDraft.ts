import type {
  PageGraph,
  PageId,
  PageNode,
} from '@/core/pages/types';
import type {
  HeaderFooterBandTemplate,
  HeaderFooterHorizontalSlot,
  HeaderFooterTemplate,
} from './types';

export type HeaderFooterEditorTargetMode =
  | 'all'
  | 'current'
  | 'selected'
  | 'current-page-label-section';

export interface HeaderFooterEditorSlots {
  left: string;
  center: string;
  right: string;
}

export interface HeaderFooterEditorDraft {
  name: string;
  targetMode: HeaderFooterEditorTargetMode;
  parity: 'all' | 'odd' | 'even';
  excludeFirstPhysicalPage: boolean;
  excludeLastPhysicalPage: boolean;
  header: HeaderFooterEditorSlots;
  footer: HeaderFooterEditorSlots;
  fontFamily: string;
  fontSizePt: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  opacity: number;
  leftMarginPt: number;
  rightMarginPt: number;
  headerOffsetFromTopPt: number;
  footerOffsetFromBottomPt: number;
  headerSeparator: boolean;
  footerSeparator: boolean;
}

export interface HeaderFooterEditorCompileInput {
  pageGraph: PageGraph<PageNode>;
  currentPageId: PageId | null;
  selectedPageIds: readonly PageId[];
}

export function createDefaultHeaderFooterEditorDraft(): HeaderFooterEditorDraft {
  return {
    name: 'Header & Footer',
    targetMode: 'all',
    parity: 'all',
    excludeFirstPhysicalPage: false,
    excludeLastPhysicalPage: false,
    header: {
      left: '',
      center: '',
      right: '',
    },
    footer: {
      left: '',
      center: '',
      right: 'Page {{physicalPage}} of {{pageCount}}',
    },
    fontFamily: 'Helvetica',
    fontSizePt: 10,
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: '#475569',
    opacity: 0.95,
    leftMarginPt: 36,
    rightMarginPt: 36,
    headerOffsetFromTopPt: 24,
    footerOffsetFromBottomPt: 24,
    headerSeparator: false,
    footerSeparator: false,
  };
}

export function compileHeaderFooterEditorDraft(
  draft: HeaderFooterEditorDraft,
  input: HeaderFooterEditorCompileInput,
): HeaderFooterTemplate {
  const header = compileBand(
    draft.header,
    draft.headerSeparator,
    draft.color,
    draft.opacity,
  );
  const footer = compileBand(
    draft.footer,
    draft.footerSeparator,
    draft.color,
    draft.opacity,
  );

  if (!header && !footer) {
    throw new Error('Enter content in at least one header or footer slot.');
  }

  return {
    schemaVersion: 1,
    ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
    layout: {
      leftMarginPt: draft.leftMarginPt,
      rightMarginPt: draft.rightMarginPt,
      headerOffsetFromTopPt: draft.headerOffsetFromTopPt,
      footerOffsetFromBottomPt: draft.footerOffsetFromBottomPt,
    },
    defaultTextStyle: {
      fontFamily: draft.fontFamily,
      fontSizePt: draft.fontSizePt,
      fontWeight: draft.fontWeight,
      fontStyle: draft.fontStyle,
      color: draft.color,
      opacity: draft.opacity,
    },
    rules: [
      {
        id: 'editor-rule',
        selector: {
          include: compileTarget(draft.targetMode, input),
          parity: draft.parity,
          excludeFirstPhysicalPage: draft.excludeFirstPhysicalPage,
          excludeLastPhysicalPage: draft.excludeLastPhysicalPage,
        },
        ...(header ? { header } : {}),
        ...(footer ? { footer } : {}),
      },
    ],
  };
}

function compileBand(
  slots: HeaderFooterEditorSlots,
  separator: boolean,
  color: string,
  opacity: number,
): HeaderFooterBandTemplate | undefined {
  const entries = (
    ['left', 'center', 'right'] as const
  ).flatMap((slot) => {
    const text = slots[slot];
    return text.trim().length > 0
      ? [[slot, { kind: 'text' as const, template: text }] as const]
      : [];
  });

  if (entries.length === 0) return undefined;

  const band: HeaderFooterBandTemplate = {};
  for (const [slot, content] of entries) {
    assignSlot(band, slot, content);
  }

  if (separator) {
    band.separator = {
      thicknessPt: 0.5,
      color,
      opacity,
    };
  }

  return band;
}

function compileTarget(
  mode: HeaderFooterEditorTargetMode,
  input: HeaderFooterEditorCompileInput,
): HeaderFooterTemplate['rules'][number]['selector']['include'] {
  switch (mode) {
    case 'all':
      return { mode: 'all' };

    case 'current': {
      const currentPageId = requireCurrentPageId(input);
      return {
        mode: 'pageIds',
        pageIds: [currentPageId],
      };
    }

    case 'selected': {
      const selected = new Set(input.selectedPageIds);
      const pageIds = input.pageGraph.pages
        .filter((page) => selected.has(page.pageId))
        .map((page) => page.pageId);

      if (pageIds.length === 0) {
        throw new Error(
          'Select at least one page before targeting selected pages.',
        );
      }

      return {
        mode: 'pageIds',
        pageIds,
      };
    }

    case 'current-page-label-section': {
      const currentPageId = requireCurrentPageId(input);
      const startPageId = currentPageLabelRangeStart(
        input.pageGraph,
        currentPageId,
      );
      if (!startPageId) {
        throw new Error(
          'The current page is not inside an editable canonical PageLabel section.',
        );
      }
      return {
        mode: 'pageLabelRange',
        startPageId,
      };
    }
  }
}

function currentPageLabelRangeStart(
  graph: PageGraph<PageNode>,
  currentPageId: PageId,
): PageId | null {
  const currentIndex = graph.pages.findIndex(
    (page) => page.pageId === currentPageId,
  );
  if (currentIndex < 0) return null;

  let best: { pageId: PageId; index: number } | null = null;
  for (const range of graph.pageLabelRanges ?? []) {
    const index = graph.pages.findIndex(
      (page) => page.pageId === range.startPageId,
    );
    if (index < 0 || index > currentIndex) continue;
    if (!best || index > best.index) {
      best = { pageId: range.startPageId, index };
    }
  }
  return best?.pageId ?? null;
}

function requireCurrentPageId(
  input: HeaderFooterEditorCompileInput,
): PageId {
  const pageId =
    input.currentPageId
    ?? input.pageGraph.pages[0]?.pageId
    ?? null;
  if (!pageId) {
    throw new Error('No current page is available.');
  }
  if (!input.pageGraph.pages.some((page) => page.pageId === pageId)) {
    throw new Error('The current page is not present in the PageGraph.');
  }
  return pageId;
}

function assignSlot(
  band: HeaderFooterBandTemplate,
  slot: HeaderFooterHorizontalSlot,
  content: NonNullable<HeaderFooterBandTemplate[HeaderFooterHorizontalSlot]>,
): void {
  band[slot] = content;
}
