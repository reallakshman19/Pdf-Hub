import type {
  ResolvedHeaderFooterContent,
} from './resolutionTypes';
import type { HeaderFooterPdfLibResources } from './pdfLibResources';

type PDFFont = import('pdf-lib').PDFFont;
type PDFImage = import('pdf-lib').PDFImage;

export type PreparedHeaderFooterContent =
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

export async function prepareHeaderFooterContent(
  content: ResolvedHeaderFooterContent,
  resources: HeaderFooterPdfLibResources,
): Promise<PreparedHeaderFooterContent> {
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

  const image = await resources.imageFor(content.binaryResourceId);
  const boxWidthPt = content.widthPt;
  const boxHeightPt = content.heightPt;

  if (content.fit === 'cover' && boxHeightPt !== undefined) {
    throw new Error(
      'Header/footer image fit "cover" with an explicit height requires clipping and is not supported by the current PDF writer.',
    );
  }

  if (boxHeightPt === undefined) {
    return {
      kind: 'image',
      image,
      widthPt: boxWidthPt,
      heightPt: boxWidthPt * (image.height / image.width),
      opacity: content.opacity,
    };
  }

  const containScale = Math.min(
    boxWidthPt / image.width,
    boxHeightPt / image.height,
  );

  return {
    kind: 'image',
    image,
    widthPt: image.width * containScale,
    heightPt: image.height * containScale,
    opacity: content.opacity,
  };
}
