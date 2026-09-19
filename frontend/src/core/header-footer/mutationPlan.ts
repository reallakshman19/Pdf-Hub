import type {
  PdfMutationHeaderFooterPage,
} from '@/core/pdf-mutation/types';
import type {
  ResolvedHeaderFooterBand,
  ResolvedHeaderFooterPage,
} from './resolutionTypes';

export function compileHeaderFooterMutationPlan(
  pages: readonly ResolvedHeaderFooterPage[],
): PdfMutationHeaderFooterPage[] {
  return pages.map((page) => ({
    pageIndex: page.physicalPageNumber - 1,
    layout: { ...page.layout },
    ...(page.header
      ? { header: compileBand(page.header) }
      : {}),
    ...(page.footer
      ? { footer: compileBand(page.footer) }
      : {}),
  }));
}

function compileBand(
  band: ResolvedHeaderFooterBand,
): NonNullable<PdfMutationHeaderFooterPage['header']> {
  return {
    ...(band.left
      ? { left: compileContent(band.left) }
      : {}),
    ...(band.center
      ? { center: compileContent(band.center) }
      : {}),
    ...(band.right
      ? { right: compileContent(band.right) }
      : {}),
    ...(band.separator
      ? { separator: { ...band.separator } }
      : {}),
  };
}

function compileContent(
  content:
    | NonNullable<ResolvedHeaderFooterBand['left']>
    | NonNullable<ResolvedHeaderFooterBand['center']>
    | NonNullable<ResolvedHeaderFooterBand['right']>,
): NonNullable<
  NonNullable<PdfMutationHeaderFooterPage['header']>['left']
> {
  if (content.kind === 'text') {
    return {
      kind: 'text',
      text: content.text,
      style: { ...content.style },
    };
  }

  return {
    kind: 'image',
    binaryResourceId: content.binaryResourceId,
    widthPt: content.widthPt,
    ...(content.heightPt !== undefined
      ? { heightPt: content.heightPt }
      : {}),
    opacity: content.opacity,
    fit: content.fit,
  };
}
