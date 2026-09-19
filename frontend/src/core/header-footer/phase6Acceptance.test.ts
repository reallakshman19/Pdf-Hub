import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocument } from 'pdfjs-dist';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { useAnnotationStore } from '@/core/annotations/store';
import {
  materializePdfCommand,
} from '@/core/commands/types';
import {
  applyRedo,
  applyUndo,
} from '@/core/document-history/transactions';
import { useHistoryStore } from '@/core/document-history/store';
import type { HistoryState } from '@/core/document-history/types';
import {
  createPageGraph,
  rekeyPageGraph,
} from '@/core/pages/pageGraph';
import {
  reanchorPageLabelRangesAfterGraphChange,
  withPageLabelRanges,
} from '@/core/pages/pageLabels';
import { writePdfPageLabels } from '@/core/pages/pdfPageLabelWriter';
import { reorderPageGraphByOrder } from '@/core/pages/structuralPageGraph';
import type {
  PageGraph,
  PageNode,
} from '@/core/pages/types';
import { useSessionStore } from '@/core/session/store';
import { executeHeaderFooterTemplateMutation } from './executeMutation';
import {
  createPrintedNumberingRule,
} from './numberingPresets';
import { resolveHeaderFooterTemplate } from './resolver';
import type { HeaderFooterTemplate } from './types';

const persistenceMocks = vi.hoisted(() => ({
  saveAnnotations: vi.fn(),
}));

vi.mock('@/core/annotations/persistence', () => ({
  saveAnnotations: persistenceMocks.saveAnnotations,
}));

const PAGE_IDS = [
  'cover',
  'front-1',
  'front-2',
  'front-3',
  'front-4',
  'body-1',
  'body-2',
  'body-3',
  'appendix-1',
  'appendix-2',
] as const;

const PAGE_LABEL_RANGES = [
  { startPageId: 'cover', prefix: 'Cover' },
  { startPageId: 'front-1', style: 'roman-lower' as const },
  { startPageId: 'body-1', style: 'decimal' as const },
  {
    startPageId: 'appendix-1',
    style: 'decimal' as const,
    prefix: 'A-',
  },
];

const SECTION_PRESERVING_REORDER = [
  0, 1, 2, 3, 4,
  8, 9,
  5, 6, 7,
];

function page(
  pageId: string,
  currentIndex: number,
): PageNode {
  return {
    pageId,
    documentKey: 'acceptance',
    originalPageNumber: currentIndex + 1,
    currentIndex,
    width: 595,
    height: 842,
    rotation: 0,
  };
}

function acceptanceGraph(): PageGraph<PageNode> {
  return withPageLabelRanges(
    createPageGraph(
      PAGE_IDS.map((pageId, index) => page(pageId, index)),
    ),
    PAGE_LABEL_RANGES,
  );
}

function acceptanceTemplate(): HeaderFooterTemplate {
  return {
    schemaVersion: 1,
    name: 'Phase 6 acceptance numbering',
    layout: {
      leftMarginPt: 36,
      rightMarginPt: 36,
      headerOffsetFromTopPt: 24,
      footerOffsetFromBottomPt: 24,
    },
    defaultTextStyle: {
      fontFamily: 'Helvetica',
      fontSizePt: 10,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#202020',
      opacity: 1,
    },
    rules: [
      createPrintedNumberingRule(
        'logical-label',
        {
          include: {
            mode: 'pageLabelRange',
            startPageId: 'front-1',
          },
        },
        { ruleId: 'front-matter' },
      ),
      createPrintedNumberingRule(
        'section-page-of-total',
        {
          include: {
            mode: 'pageLabelRange',
            startPageId: 'body-1',
          },
        },
        { ruleId: 'body' },
      ),
      createPrintedNumberingRule(
        'appendix-label',
        {
          include: {
            mode: 'pageLabelRange',
            startPageId: 'appendix-1',
          },
        },
        {
          ruleId: 'appendix',
          appendixTitle: 'Appendix A',
        },
      ),
    ],
  };
}

async function createAnchoredPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const pageId of PAGE_IDS) {
    const pdfPage = doc.addPage([595, 842]);
    pdfPage.drawText(`ANCHOR:${pageId}`, {
      x: 36,
      y: 421,
      size: 9,
      font,
    });
  }

  return new Uint8Array(await doc.save());
}

async function inspectPdf(bytes: Uint8Array): Promise<{
  labels: string[] | null;
  texts: string[];
}> {
  const task = getDocument({
    data: bytes.slice(),
  });
  const doc = await task.promise;

  try {
    const labels = await doc.getPageLabels();
    const texts: string[] = [];

    for (
      let pageNumber = 1;
      pageNumber <= doc.numPages;
      pageNumber += 1
    ) {
      const pdfPage = await doc.getPage(pageNumber);
      try {
        const textContent = await pdfPage.getTextContent();
        texts.push(
          textContent.items
            .flatMap((item) =>
              'str' in item && typeof item.str === 'string'
                ? [item.str]
                : [],
            )
            .join(' '),
        );
      } finally {
        pdfPage.cleanup();
      }
    }

    return { labels, texts };
  } finally {
    await doc.destroy();
  }
}

function historyState(
  bytes: Uint8Array,
  documentKey: string,
  pageGraph: PageGraph<PageNode>,
  currentPageId: string,
): HistoryState & { bytes: Uint8Array } {
  const currentIndex = pageGraph.pages.findIndex(
    (candidate) => candidate.pageId === currentPageId,
  );

  return {
    bytes,
    pageCount: pageGraph.pages.length,
    pageGraph,
    documentKey,
    selectedPageIds: [currentPageId],
    selectedPages: [currentIndex + 1],
    currentPageId,
    currentPage: currentIndex + 1,
    annotations: [],
  };
}

describe('Phase 6 header/footer acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistenceMocks.saveAnnotations.mockResolvedValue(undefined);
    useHistoryStore.getState().clear();
    useAnnotationStore.getState().setAnnotations([]);
    useSessionStore.getState().clearDocument();
  });

  afterEach(() => {
    useHistoryStore.getState().clear();
    useAnnotationStore.getState().setAnnotations([]);
    useSessionStore.getState().clearDocument();
  });

  it('previews, writes, reorders, undo/redoes and reopens while preserving PageLabels and printed page content', async () => {
    const graph = acceptanceGraph();
    const template = acceptanceTemplate();
    const now = new Date('2026-09-19T03:00:00.000Z');

    const preview = resolveHeaderFooterTemplate(
      template,
      graph,
      {
        fileName: 'phase6-acceptance.pdf',
        now,
      },
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    expect(preview.pages[0]?.footer).toBeUndefined();
    expect(preview.pages[1]?.footer?.center).toMatchObject({
      kind: 'text',
      text: 'i',
    });
    expect(preview.pages[5]?.footer?.center).toMatchObject({
      kind: 'text',
      text: 'Page 1 of 3',
    });
    expect(preview.pages[8]?.footer?.right).toMatchObject({
      kind: 'text',
      text: 'Appendix A — A-1',
    });

    const base = await createAnchoredPdf();
    const labeled = await writePdfPageLabels(
      base,
      graph,
      graph.pageLabelRanges ?? [],
    );
    const beforeApplyInspection = await inspectPdf(labeled.bytes);

    expect(beforeApplyInspection.labels).toEqual([
      'Cover',
      'i',
      'ii',
      'iii',
      'iv',
      '1',
      '2',
      '3',
      'A-1',
      'A-2',
    ]);

    const applied = await executeHeaderFooterTemplateMutation(
      labeled.bytes,
      graph,
      template,
      {
        fileName: 'phase6-acceptance.pdf',
        now,
      },
      undefined,
    );

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const appliedInspection = await inspectPdf(applied.bytes);

    expect(appliedInspection.labels).toEqual(
      beforeApplyInspection.labels,
    );
    expect(appliedInspection.texts[0]).toContain(
      'ANCHOR:cover',
    );
    expect(appliedInspection.texts[0]).not.toMatch(
      /Appendix A|Page 1 of 3/,
    );
    expect(appliedInspection.texts[1]).toContain(
      'ANCHOR:front-1',
    );
    expect(appliedInspection.texts[1]).toMatch(/\bi\b/);
    expect(appliedInspection.texts[5]).toContain(
      'ANCHOR:body-1',
    );
    expect(appliedInspection.texts[5]).toContain(
      'Page 1 of 3',
    );
    expect(appliedInspection.texts[8]).toContain(
      'ANCHOR:appendix-1',
    );
    expect(appliedInspection.texts[8]).toContain(
      'Appendix A',
    );
    expect(appliedInspection.texts[8]).toContain('A-1');

    const reorderedBytes = await PdfEditAdapter.reorderPages(
      applied.bytes,
      SECTION_PRESERVING_REORDER,
    );
    const rawReorderedGraph = reorderPageGraphByOrder(
      graph,
      SECTION_PRESERVING_REORDER,
    );
    const reorderedGraph =
      reanchorPageLabelRangesAfterGraphChange(
        graph,
        rawReorderedGraph,
      );
    const relabeledAfterReorder = await writePdfPageLabels(
      reorderedBytes,
      reorderedGraph,
      reorderedGraph.pageLabelRanges ?? [],
    );

    const beforeKey = await FileAdapter.hashBytes(applied.bytes);
    const afterKey = await FileAdapter.hashBytes(
      relabeledAfterReorder.bytes,
    );
    const historyBeforeGraph = rekeyPageGraph(
      graph,
      beforeKey,
    );
    const historyAfterGraph = rekeyPageGraph(
      reorderedGraph,
      afterKey,
    );

    const beforeState = historyState(
      applied.bytes,
      beforeKey,
      historyBeforeGraph,
      'body-1',
    );
    const afterState = historyState(
      relabeledAfterReorder.bytes,
      afterKey,
      historyAfterGraph,
      'body-1',
    );

    useSessionStore.getState().openDocument({
      documentKey: afterKey,
      fileName: 'phase6-acceptance.pdf',
      bytes: afterState.bytes,
      pageCount: afterState.pageCount,
      pageGraph: afterState.pageGraph ?? undefined,
    });
    useSessionStore.getState().setSelectedPageIds(
      afterState.selectedPageIds,
    );
    useSessionStore.getState().setPageById('body-1');

    useHistoryStore.getState().push({
      id: 'phase6-acceptance-reorder',
      command: materializePdfCommand(
        {
          type: 'REORDER_PAGES_BY_ORDER',
          payload: {
            order: SECTION_PRESERVING_REORDER,
          },
        },
        'toolbar',
        beforeKey,
        {
          id: 'phase6-acceptance-command',
          createdAt: now.toISOString(),
        },
      ),
      label: 'Acceptance reorder',
      timestamp: now.getTime(),
      before: beforeState,
      after: afterState,
    });

    await expect(applyUndo()).resolves.toBe(true);
    expect(
      useSessionStore
        .getState()
        .pageGraph?.pages.map((item) => item.pageId),
    ).toEqual([...PAGE_IDS]);
    expect(useSessionStore.getState().workingBytes).toEqual(
      applied.bytes,
    );

    await expect(applyRedo()).resolves.toBe(true);
    expect(
      useSessionStore
        .getState()
        .pageGraph?.pages.map((item) => item.pageId),
    ).toEqual([
      'cover',
      'front-1',
      'front-2',
      'front-3',
      'front-4',
      'appendix-1',
      'appendix-2',
      'body-1',
      'body-2',
      'body-3',
    ]);

    const savedBytes = useSessionStore.getState().workingBytes;
    expect(savedBytes).not.toBeNull();
    if (!savedBytes) return;

    const reopened = await inspectPdf(savedBytes);

    expect(reopened.labels).toEqual([
      'Cover',
      'i',
      'ii',
      'iii',
      'iv',
      'A-1',
      'A-2',
      '1',
      '2',
      '3',
    ]);

    expect(reopened.texts[5]).toContain(
      'ANCHOR:appendix-1',
    );
    expect(reopened.texts[5]).toContain('Appendix A');
    expect(reopened.texts[5]).toContain('A-1');

    expect(reopened.texts[7]).toContain(
      'ANCHOR:body-1',
    );
    expect(reopened.texts[7]).toContain('Page 1 of 3');
    expect(reopened.texts[9]).toContain(
      'ANCHOR:body-3',
    );
    expect(reopened.texts[9]).toContain('Page 3 of 3');
  });
});
