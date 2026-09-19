import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { useSessionStore } from '@/core/session/store';
import { editorStateToPdfBlocks } from './export/richTextRenderer';
import { estimateRichContentMetrics } from './export/richContentMetrics';
import { getActiveRichBoxStyleTarget } from './writerRichBoxStyleActions';
import { ensureRichTextEditing } from './ensureRichTextEditing';
import { useWriterV2Store } from './writerV2Store';
import type { WriterElementV2 } from './types';

type PdfLibDocument = import('pdf-lib').PDFDocument;

export interface WriterRichBoxFitResult {
  changed: boolean;
  id: string | null;
  message: string;
  estimatedHeight?: number;
  appliedHeight?: number;
}

export interface WriterRichBoxBulkFitResult {
  changed: boolean;
  requestedCount: number;
  fittedCount: number;
  skippedCount: number;
  message: string;
}

const MIN_RICH_BOX_HEIGHT = 80;
const MAX_RICH_BOX_HEIGHT_RATIO = 0.9;
const EXTRA_EXPORT_SAFE_PADDING = 18;
const FITTABLE_TYPES = new Set<WriterElementV2['type']>([
  'richTextBox',
  'textCallout',
  'richNote',
]);

export async function fitActiveRichBoxToContent(): Promise<WriterRichBoxFitResult> {
  const target = getActiveRichBoxStyleTarget();
  const id = target?.id ?? await ensureRichTextEditing();

  if (!id) {
    return {
      changed: false,
      id: null,
      message: 'Open a PDF before fitting Writer rich box content.',
    };
  }

  const store = useWriterV2Store.getState();
  const session = useSessionStore.getState();
  const element = store.elements.find((item) => item.id === id);
  const sourceBytes = session.workingBytes ?? session.originalBytes;

  if (!element || !sourceBytes) {
    return {
      changed: false,
      id,
      message: 'Writer rich box or source PDF is not available.',
    };
  }

  const { PDFDocument } = await pdfLib();
  const pdf = await PDFDocument.load(sourceBytes);
  const fit = computeRichBoxFit(element, pdf);
  const result = await applyRichBoxFit(
    element,
    fit.nextY,
    fit.nextHeight,
  );

  return {
    changed: result.changed,
    id,
    message: result.changed
      ? `Fitted Writer rich box to ${fit.nextHeight}px height.`
      : result.reason,
    estimatedHeight: fit.estimatedHeight,
    appliedHeight: fit.nextHeight,
  };
}

export async function fitRichBoxToContentById(
  id: string,
): Promise<WriterRichBoxFitResult> {
  const store = useWriterV2Store.getState();
  const session = useSessionStore.getState();
  const sourceBytes = session.workingBytes ?? session.originalBytes;
  const element = store.elements.find((item) => item.id === id);

  if (!element || !sourceBytes) {
    return {
      changed: false,
      id,
      message: 'Writer rich box or source PDF is not available.',
    };
  }

  if (!isFittableRichBox(element)) {
    return {
      changed: false,
      id,
      message: 'Writer element is not an editable rich box.',
    };
  }

  const { PDFDocument } = await pdfLib();
  const pdf = await PDFDocument.load(sourceBytes);
  const fit = computeRichBoxFit(element, pdf);
  const result = applyRichBoxFit(element, fit.nextY, fit.nextHeight);

  return {
    changed: result.changed,
    id,
    message: result.changed
      ? `Fitted Writer rich box ${shortId(id)} to ${fit.nextHeight}px height.`
      : result.reason,
    estimatedHeight: fit.estimatedHeight,
    appliedHeight: fit.nextHeight,
  };
}

export async function fitRichBoxesToContentByIds(
  ids: string[],
): Promise<WriterRichBoxBulkFitResult> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const session = useSessionStore.getState();
  const sourceBytes = session.workingBytes ?? session.originalBytes;

  if (uniqueIds.length === 0) {
    return {
      changed: false,
      requestedCount: 0,
      fittedCount: 0,
      skippedCount: 0,
      message: 'No Writer rich boxes were selected for fitting.',
    };
  }

  if (!sourceBytes) {
    return {
      changed: false,
      requestedCount: uniqueIds.length,
      fittedCount: 0,
      skippedCount: uniqueIds.length,
      message: 'Open a PDF before fitting Writer rich boxes.',
    };
  }

  const { PDFDocument } = await pdfLib();
  const pdf = await PDFDocument.load(sourceBytes);
  let fittedCount = 0;
  let skippedCount = 0;

  for (const id of uniqueIds) {
    const latest = useWriterV2Store.getState();
    const element = latest.elements.find((item) => item.id === id);

    if (!element || !isFittableRichBox(element)) {
      skippedCount += 1;
      continue;
    }

    const fit = computeRichBoxFit(element, pdf);
    const result = await applyRichBoxFit(
      element,
      fit.nextY,
      fit.nextHeight,
    );

    if (result.changed) {
      fittedCount += 1;
    } else {
      skippedCount += 1;
    }
  }

  return {
    changed: fittedCount > 0,
    requestedCount: uniqueIds.length,
    fittedCount,
    skippedCount,
    message: `Fitted ${fittedCount} Writer rich box(es); skipped ${skippedCount}.`,
  };
}

function computeRichBoxFit(
  element: WriterElementV2,
  pdf: PdfLibDocument,
): {
  nextY: number;
  nextHeight: number;
  estimatedHeight: number;
} {
  const page = pdf.getPage(Math.max(0, Math.min(element.pageIndex, pdf.getPageCount() - 1)));
  const pageSize = page.getSize();
  const padding = element.style.padding ?? 8;
  const blocks = editorStateToPdfBlocks(element.editorStateJson, element.plainText ?? '');
  const metrics = estimateRichContentMetrics(blocks, {
    fontSize: element.style.fontSize ?? 11,
    availableWidth: Math.max(1, element.rect.width - padding * 2),
    padding,
  });

  const requestedHeight = Math.ceil(
    metrics.estimatedHeight + padding * 2 + EXTRA_EXPORT_SAFE_PADDING,
  );
  const maxPageHeight = Math.max(
    MIN_RICH_BOX_HEIGHT,
    Math.floor(pageSize.height * MAX_RICH_BOX_HEIGHT_RATIO),
  );
  const nextHeight = clamp(
    requestedHeight,
    MIN_RICH_BOX_HEIGHT,
    maxPageHeight,
  );

  const currentTop = element.rect.y + element.rect.height;
  const nextY = clamp(
    currentTop - nextHeight,
    0,
    Math.max(0, pageSize.height - nextHeight),
  );

  return {
    nextY,
    nextHeight,
    estimatedHeight: metrics.estimatedHeight,
  };
}

async function applyRichBoxFit(
  element: WriterElementV2,
  nextY: number,
  nextHeight: number,
) {
  return useWriterV2Store
    .getState()
    .dispatchWriterCommandDurable({
      type: 'UPDATE_WRITER_ELEMENT',
      id: element.id,
      patch: {
        rect: {
          ...element.rect,
          y: nextY,
          height: nextHeight,
        },
      },
    });
}

function isFittableRichBox(element: WriterElementV2): boolean {
  return FITTABLE_TYPES.has(element.type) && !element.locked && !element.hidden;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function shortId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8);
}
