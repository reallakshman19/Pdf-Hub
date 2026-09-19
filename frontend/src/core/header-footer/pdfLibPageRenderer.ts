import type {
  ResolvedHeaderFooterBand,
  ResolvedHeaderFooterContent,
  ResolvedHeaderFooterPage,
} from './resolutionTypes';
import {
  createHeaderFooterVisualGeometry,
  visualPointToPdf,
  type HeaderFooterVisualGeometry,
} from './pdfWriterGeometry';
import type { HeaderFooterPdfLibResources } from './pdfLibResources';

type PDFPage = import('pdf-lib').PDFPage;
type PDFFont = import('pdf-lib').PDFFont;
type PDFImage = import('pdf-lib').PDFImage;
type PdfLibNs = Awaited<
  ReturnType<typeof import('@/core/pdf/lazyPdfLib').pdfLib>
>;

type PreparedContent =
  | {
      kind: 'text';
      text: string;
      font: PDFFont;
      widthPt: number;
      heightPt: number;
      color: string;
      opacity: number;
    }
  | {
      kind: 'image';
      image: PDFImage;
      widthPt: number;
      heightPt: number;
      opacity: number;
    };

export async function renderResolvedHeaderFooterPage(
  page: PDFPage,
  resolved: ResolvedHeaderFooterPage,
  resources: HeaderFooterPdfLibResources,
  lib: PdfLibNs,
): Promise<void> {
  const geometry = createHeaderFooterVisualGeometry(
    page.getWidth(),
    page.getHeight(),
    page.getRotation().angle,
  );

  if (resolved.header) {
    await drawBand(
      page,
      resolved.header,
      'header',
      geometry,
      resolved.layout,
      resources,
      lib,
    );
  }

  if (resolved.footer) {
    await drawBand(
      page,
      resolved.footer,
      'footer',
      geometry,
      resolved.layout,
      resources,
      lib,
    );
  }
}

async function drawBand(
  page: PDFPage,
  band: ResolvedHeaderFooterBand,
  bandKind: 'header' | 'footer',
  geometry: HeaderFooterVisualGeometry,
  layout: ResolvedHeaderFooterPage['layout'],
  resources: HeaderFooterPdfLibResources,
  lib: PdfLibNs,
): Promise<void> {
  const entries = await Promise.all(
    ([
      ['left', band.left],
      ['center', band.center],
      ['right', band.right],
    ] as const)
      .filter(
        (entry): entry is readonly [
          'left' | 'center' | 'right',
          ResolvedHeaderFooterContent,
        ] => Boolean(entry[1]),
      )
      .map(async ([slot, content]) => ({
        slot,
        prepared: await prepareContent(content, resources),
      })),
  );

  const usableWidth =
    geometry.visualWidth - layout.leftMarginPt - layout.rightMarginPt;

  for (const { prepared } of entries) {
    if (prepared.widthPt > usableWidth) {
      throw new Error(
        `Header/footer content width ${prepared.widthPt.toFixed(2)}pt exceeds usable page width ${usableWidth.toFixed(2)}pt.`,
      );
    }
  }

  const bandHeight = Math.max(
    0,
    ...entries.map(({ prepared }) => prepared.heightPt),
  );

  for (const { slot, prepared } of entries) {
    drawPreparedContent(
      page,
      prepared,
      slot,
      bandKind,
      geometry,
      layout,
      lib,
    );
  }

  if (band.separator && bandHeight > 0) {
    drawSeparator(
      page,
      band.separator,
      bandKind,
      bandHeight,
      geometry,
      layout,
      lib,
    );
  }
}

async function prepareContent(
  content: ResolvedHeaderFooterContent,
  resources: HeaderFooterPdfLibResources,
): Promise<PreparedContent> {
  if (content.kind === 'text') {
    const font = await resources.fontFor(content.style);
    return {
      kind: 'text',
      text: content.text,
      font,
      widthPt: font.widthOfTextAtSize(
        content.text,
        content.style.fontSizePt,
      ),
      heightPt: content.style.fontSizePt,
      color: content.style.color,
      opacity: content.style.opacity,
    };
  }

  const embedded = await resources.imageFor(
    content.binaryResourceId,
    content.widthPt,
    content.heightPt,
  );

  return {
    kind: 'image',
    image: embedded.image,
    widthPt: embedded.widthPt,
    heightPt: embedded.heightPt,
    opacity: content.opacity,
  };
}

function drawPreparedContent(
  page: PDFPage,
  content: PreparedContent,
  slot: 'left' | 'center' | 'right',
  bandKind: 'header' | 'footer',
  geometry: HeaderFooterVisualGeometry,
  layout: ResolvedHeaderFooterPage['layout'],
  lib: PdfLibNs,
): void {
  const x =
    slot === 'left'
      ? layout.leftMarginPt
      : slot === 'center'
        ? (geometry.visualWidth - content.widthPt) / 2
        : geometry.visualWidth - layout.rightMarginPt - content.widthPt;

  const y =
    bandKind === 'header'
      ? geometry.visualHeight
        - layout.headerOffsetFromTopPt
        - content.heightPt
      : layout.footerOffsetFromBottomPt;

  if (
    x < 0
    || y < 0
    || x + content.widthPt > geometry.visualWidth
    || y + content.heightPt > geometry.visualHeight
  ) {
    throw new Error(
      'Header/footer content resolves outside the visual page bounds.',
    );
  }

  const point = visualPointToPdf(geometry, x, y);
  const rotation = lib.degrees(geometry.rotation);

  if (content.kind === 'text') {
    page.drawText(content.text, {
      x: point.x,
      y: point.y,
      font: content.font,
      size: content.heightPt,
      color: hexToRgb(content.color, lib),
      opacity: content.opacity,
      rotate: rotation,
    });
    return;
  }

  page.drawImage(content.image, {
    x: point.x,
    y: point.y,
    width: content.widthPt,
    height: content.heightPt,
    opacity: content.opacity,
    rotate: rotation,
  });
}

function drawSeparator(
  page: PDFPage,
  separator: NonNullable<ResolvedHeaderFooterBand['separator']>,
  bandKind: 'header' | 'footer',
  bandHeight: number,
  geometry: HeaderFooterVisualGeometry,
  layout: ResolvedHeaderFooterPage['layout'],
  lib: PdfLibNs,
): void {
  const gap = 4;
  const y =
    bandKind === 'header'
      ? geometry.visualHeight
        - layout.headerOffsetFromTopPt
        - bandHeight
        - gap
      : layout.footerOffsetFromBottomPt + bandHeight + gap;

  if (y < 0 || y > geometry.visualHeight) {
    throw new Error(
      'Header/footer separator resolves outside the visual page bounds.',
    );
  }

  const start = visualPointToPdf(
    geometry,
    layout.leftMarginPt + separator.insetLeftPt,
    y,
  );
  const end = visualPointToPdf(
    geometry,
    geometry.visualWidth
      - layout.rightMarginPt
      - separator.insetRightPt,
    y,
  );

  page.drawLine({
    start,
    end,
    thickness: separator.thicknessPt,
    color: hexToRgb(separator.color, lib),
    opacity: separator.opacity,
  });
}

function hexToRgb(
  hex: string,
  lib: PdfLibNs,
): import('pdf-lib').Color {
  const normalized = hex.slice(1);
  return lib.rgb(
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  );
}
