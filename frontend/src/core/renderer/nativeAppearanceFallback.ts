import { AnnotationMode, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

/**
 * PDF.js only populates annotationCanvasMap for certain appearance kinds
 * (notably Stamp); FreeText and Line APs are often painted into the page
 * operator list instead. Rendering the entire source page and cropping its
 * /Rect would capture CAD content and other nearby annotations.
 *
 * Build a temporary, in-memory PDF with one blank, /Rect-cropped page per
 * requested native annotation. Each page references the *original* /AP,
 * resources and /Annot object, but contains no drawing contents. The output
 * is a transparent PNG of that one appearance only. The source PDF is never
 * changed or saved to the user's document.
 */
export async function renderIsolatedNativeAppearances(
  doc: PDFDocumentProxy,
  sourcePageNumber: number,
  requestedRefs: readonly string[],
): Promise<Map<string, string>> {
  const lib = await pdfLib();
  // PDF.js getData returns the exact loaded revision, even if the document
  // originated in a revision store instead of useSessionStore. Copy it because
  // pdf-lib may use views over the input bytes.
  const bytes = new Uint8Array(await doc.getData());
  const pdf = await lib.PDFDocument.load(bytes);
  if (sourcePageNumber < 1 || sourcePageNumber > pdf.getPageCount()) return new Map();
  const source = pdf.getPage(sourcePageNumber - 1);
  const annotations = source.node.lookupMaybe(lib.PDFName.of('Annots'), lib.PDFArray);
  if (!annotations) return new Map();

  const wanted = new Set(requestedRefs);
  const materialized: Array<{ ref: string; pageNumber: number }> = [];
  const originalCount = pdf.getPageCount();
  const media = source.getMediaBox();
  const rotation = source.getRotation().angle;

  for (let index = 0; index < annotations.size(); index += 1) {
    const raw = annotations.get(index);
    if (!(raw instanceof lib.PDFRef)) continue;
    const ref = `${raw.objectNumber}R${raw.generationNumber === 0 ? '' : raw.generationNumber}`;
    if (!wanted.has(ref)) continue;
    const dict = annotations.lookupMaybe(index, lib.PDFDict);
    if (!dict?.get(lib.PDFName.of('AP'))) continue;
    const coordinates = dict.lookupMaybe(lib.PDFName.of('Rect'), lib.PDFArray);
    if (!coordinates || coordinates.size() < 4) continue;
    const rect = Array.from({ length: 4 }, (_, i) =>
      coordinates.lookup(i, lib.PDFNumber).asNumber());
    if (rect.some((value) => !Number.isFinite(value))) continue;
    const [x0, y0, x1, y1] = rect;
    const left = Math.min(x0, x1);
    const bottom = Math.min(y0, y1);
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    if (width < 0.1 || height < 0.1) continue;

    const page = pdf.addPage([media.width, media.height]);
    page.setMediaBox(media.x, media.y, media.width, media.height);
    page.setCropBox(left, bottom, width, height);
    page.setRotation(lib.degrees(rotation));
    // A single indirect /Annot reference means other source annotations
    // cannot contaminate this preview, even when their /Rects overlap.
    page.node.set(lib.PDFName.of('Annots'), pdf.context.obj([raw]));
    materialized.push({ ref, pageNumber: originalCount + materialized.length + 1 });
  }
  if (materialized.length === 0) return new Map();

  const file = await pdf.save();
  const task = getDocument({ data: new Uint8Array(file) });
  const appearanceDoc = await task.promise;
  const images = new Map<string, string>();
  try {
    let cursor = 0;
    const renderNext = async (): Promise<void> => {
      while (cursor < materialized.length) {
        const item = materialized[cursor++];
        const page = await appearanceDoc.getPage(item.pageNumber);
        try {
          const viewportAtOne = page.getViewport({ scale: 1 });
          // Keep memory bounded for A2 drawings and oversized annotation /Rects.
          const scale = Math.min(2, Math.sqrt(4_000_000 / Math.max(
            1, viewportAtOne.width * viewportAtOne.height,
          )));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.ceil(viewport.width));
          canvas.height = Math.max(1, Math.ceil(viewport.height));
          const context = canvas.getContext('2d');
          if (!context) continue;
          await page.render({
            canvas,
            canvasContext: context,
            viewport,
            annotationMode: AnnotationMode.ENABLE,
            background: 'rgba(0,0,0,0)',
          }).promise;
          images.set(item.ref, canvas.toDataURL('image/png'));
          canvas.width = 0;
          canvas.height = 0;
        } finally {
          page.cleanup();
        }
      }
    };
    // A large engineering page may have 60+ native APs. Limit parallel
    // rasterization so a single page cannot monopolize renderer memory.
    await Promise.all(Array.from(
      { length: Math.min(4, materialized.length) },
      () => renderNext(),
    ));
  } finally {
    await appearanceDoc.destroy();
  }
  return images;
}
