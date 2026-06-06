import type {
  PdfRect,
  WriterDocumentMetaV2,
  WriterPageSetupV2,
  WriterPageViewport,
} from './types';
import {
  getWriterPageContentBounds,
  normalizeWriterPageSetup,
} from './writerDocumentMode';

export interface WriterBlankPageLayoutInput {
  pageSetup: WriterPageSetupV2;
  scale?: number;
}

export interface WriterBlankPageLayout {
  viewport: WriterPageViewport;
  pageBounds: PdfRect;
  contentBounds: PdfRect;
  cssWidth: number;
  cssHeight: number;
  marginGuideCss: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface WriterBlankDocumentPageDescriptor {
  pageIndex: number;
  pageNumber: number;
  label: string;
}

export function createWriterBlankPageViewport(
  pageSetup: WriterPageSetupV2,
  scale = 1,
): WriterPageViewport {
  const setup = normalizeWriterPageSetup(pageSetup);

  return {
    pdfWidth: setup.width,
    pdfHeight: setup.height,
    scale: normalizeBlankPageScale(scale),
    rotation: 0,
  };
}

export function createWriterBlankPageLayout(
  input: WriterBlankPageLayoutInput,
): WriterBlankPageLayout {
  const setup = normalizeWriterPageSetup(input.pageSetup);
  const scale = normalizeBlankPageScale(input.scale ?? 1);
  const viewport = createWriterBlankPageViewport(setup, scale);
  const pageBounds: PdfRect = {
    x: 0,
    y: 0,
    width: setup.width,
    height: setup.height,
  };
  const contentBounds = getWriterPageContentBounds(setup);

  return {
    viewport,
    pageBounds,
    contentBounds,
    cssWidth: setup.width * scale,
    cssHeight: setup.height * scale,
    marginGuideCss: {
      left: contentBounds.x * scale,
      top: (setup.height - contentBounds.y - contentBounds.height) * scale,
      width: contentBounds.width * scale,
      height: contentBounds.height * scale,
    },
  };
}

export function createWriterBlankDocumentPageDescriptors(
  meta: WriterDocumentMetaV2 | null,
): WriterBlankDocumentPageDescriptor[] {
  if (!meta || meta.mode !== 'blankDocument') {
    return [];
  }

  return Array.from({ length: Math.max(1, Math.floor(meta.pageCount)) }, (_, pageIndex) => ({
    pageIndex,
    pageNumber: pageIndex + 1,
    label: `Page ${pageIndex + 1}`,
  }));
}

export function normalizeBlankPageScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return 1;
  }

  return Math.max(0.1, Math.min(scale, 4));
}
