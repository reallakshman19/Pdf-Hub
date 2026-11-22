import { pdfLib } from '@/core/pdf/lazyPdfLib';

type PdfLib = Awaited<ReturnType<typeof pdfLib>>;
type PDFDict = import('pdf-lib').PDFDict;
type PDFDocument = import('pdf-lib').PDFDocument;
type PDFRef = import('pdf-lib').PDFRef;
type PDFStream = import('pdf-lib').PDFStream;

function numbers(dict: PDFDict, key: string, lib: PdfLib, length: number): number[] | null {
  const array = dict.lookupMaybe(lib.PDFName.of(key), lib.PDFArray);
  if (!array || array.size() !== length) return null;
  const result: number[] = [];
  for (let i = 0; i < length; i++) {
    const value = array.lookupMaybe(i, lib.PDFNumber)?.asNumber();
    if (value === undefined || !Number.isFinite(value)) return null;
    result.push(value);
  }
  return result;
}

function normalAppearance(
  doc: PDFDocument,
  annotation: PDFDict,
  lib: PdfLib,
): { stream: PDFStream; ref: PDFRef } | null {
  const ap = annotation.lookupMaybe(lib.PDFName.of('AP'), lib.PDFDict);
  const normalRaw = ap?.get(lib.PDFName.of('N'));
  if (!normalRaw) return null;
  let raw = normalRaw;
  let target = doc.context.lookup(raw);

  // PDF /AP/N can be a normal Form XObject *or* a dictionary of appearance
  // states. A form must be chosen using the annotation's /AS where present.
  if (target instanceof lib.PDFDict) {
    const appearanceState = annotation.lookupMaybe(lib.PDFName.of('AS'), lib.PDFName);
    // Never guess an appearance for an annotation with multiple normal
    // states. A plausible but wrong state is silent artwork corruption.
    const alternatives = target.keys().filter((name) => name.decodeText() !== 'Off');
    const selected = appearanceState
      ? target.get(appearanceState)
      : alternatives.length === 1 ? target.get(alternatives[0]) : undefined;
    if (!selected) {
      throw new Error('Cannot flatten ambiguous native normal appearance state without a valid /AS.');
    }
    raw = selected;
    target = doc.context.lookup(raw);
  }
  if (!(target instanceof lib.PDFStream)) return null;
  const ref = raw instanceof lib.PDFRef ? raw : doc.context.register(target);
  return { stream: target, ref };
}

/** Calculate the page CTM that maps the normal appearance's transformed
 * /BBox onto the annotation /Rect. The Form XObject applies /Matrix itself.
 */
function placement(
  bbox: number[],
  formMatrix: number[],
  rect: number[],
): [number, number, number, number, number, number] | null {
  const [a, b, c, d, e, f] = formMatrix;
  const corners = [
    [bbox[0], bbox[1]], [bbox[2], bbox[1]],
    [bbox[2], bbox[3]], [bbox[0], bbox[3]],
  ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
  const left = Math.min(...corners.map((point) => point[0]));
  const right = Math.max(...corners.map((point) => point[0]));
  const bottom = Math.min(...corners.map((point) => point[1]));
  const top = Math.max(...corners.map((point) => point[1]));
  const w = right - left;
  const h = top - bottom;
  const rw = Math.abs(rect[2] - rect[0]);
  const rh = Math.abs(rect[3] - rect[1]);
  if (w < 1e-7 || h < 1e-7 || rw < 1e-7 || rh < 1e-7) return null;
  const scaleX = rw / w;
  const scaleY = rh / h;
  return [
    scaleX, 0, 0, scaleY,
    Math.min(rect[0], rect[2]) - left * scaleX,
    Math.min(rect[1], rect[3]) - bottom * scaleY,
  ];
}

/** /NoRotate (flag 0x10) keeps an annotation upright when its page has
 * /Rotate. Per ISO 32000 the appearance pivots about the upper-left of /Rect.
 * The page viewer rotates clockwise; page content therefore needs an equal
 * counterclockwise compensation in unrotated page-user coordinates.
 */
export function noRotateCompensation(
  rect: readonly number[],
  pageDegrees: number,
): [number, number, number, number, number, number] | null {
  const degrees = ((pageDegrees % 360) + 360) % 360;
  if (degrees === 0) return null;
  if (rect.length !== 4 || !rect.every(Number.isFinite)
    || ![90, 180, 270].includes(degrees)) {
    throw new Error('Cannot flatten NoRotate annotation with unsupported page geometry or rotation.');
  }
  const left = Math.min(rect[0], rect[2]);
  const top = Math.max(rect[1], rect[3]);
  switch (degrees) {
    case 90: return [0, 1, -1, 0, left + top, top - left];
    case 180: return [-1, 0, 0, -1, 2 * left, 2 * top];
    case 270: return [0, -1, 1, 0, left - top, top + left];
  }
  return null;
}

function isVisible(annotation: PDFDict, lib: PdfLib): boolean {
  const flags = annotation.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0;
  // Invisible, Hidden and NoView suppress appearance in display intent.
  return (Math.trunc(flags) & (1 | 2 | 32)) === 0;
}

/**
 * Vector-preserving native flattened export.
 *
 * Every native normal /AP is drawn as a Form XObject into its parent page's
 * content stream. Afterwards, review /Annots are removed (hyperlink /Link\n * navigation remains). This
 * retains CAD page vectors and original stamp, FreeText and line artwork, and
 * does not depend on html/svg re-drawing of rich text.
 *
 * If a visible annotation has an unsupported appearance, fail rather than
 * silently dropping it from a purportedly complete flattened export.
 */
export async function flattenNativePdfAnnotations(bytes: Uint8Array): Promise<Uint8Array> {
  const lib = await pdfLib();
  const pdf = await lib.PDFDocument.load(bytes);

  for (const [index, page] of pdf.getPages().entries()) {
    const annots = page.node.lookupMaybe(lib.PDFName.of('Annots'), lib.PDFArray);
    if (!annots) continue;
    // Preserve hyperlinks as portable /Link objects. They are navigation,
    // not review markup: flattening appearance-bearing annotations must not
    // silently destroy engineering cross-references.
    const links: Array<import('pdf-lib').PDFObject> = [];
    for (let i = 0; i < annots.size(); i++) {
      const annotation = annots.lookupMaybe(i, lib.PDFDict);
      if (!annotation) continue;
      const subtype = annotation.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText();
      if (subtype === 'Link') {
        const link = annots.get(i);
        if (link) links.push(link);
        continue;
      }
      if (subtype === 'Redact') {
        // Drawing a /Redact annotation's black /AP does not remove the
        // underlying text/images. Never misrepresent appearance flattening
        // as secure content redaction.
        throw new Error('Cannot safely flatten a native /Redact annotation: secure content removal is required.');
      }
      if (!isVisible(annotation, lib) || subtype === 'Popup') continue;
      const appearance = normalAppearance(pdf, annotation, lib);
      if (!appearance) {
        // A Text note with no /AP is a viewer-drawn sticky-note icon, not
        // lost native artwork. Represent it explicitly in the flat copy.
        if (subtype === 'Text' && !annotation.get(lib.PDFName.of('IRT'))) {
          const rect = numbers(annotation, 'Rect', lib, 4);
          if (!rect) throw new Error(`Cannot flatten native note on page ${index + 1}: invalid /Rect`);
          const x = Math.min(rect[0], rect[2]);
          const y = Math.min(rect[1], rect[3]);
          const w = Math.min(Math.abs(rect[2] - rect[0]), 22);
          const h = Math.min(Math.abs(rect[3] - rect[1]), 22);
          if (w && h) page.drawRectangle({
            x, y, width: w, height: h,
            color: lib.rgb(1, 0.89, 0.32),
            borderColor: lib.rgb(0.48, 0.38, 0.12),
            borderWidth: 1,
          });
          continue;
        }
        if (annotation.get(lib.PDFName.of('IRT'))) continue;
        throw new Error(`Cannot flatten native ${subtype ?? 'unknown'} annotation on page ${index + 1}: missing normal /AP`);
      }
      const rect = numbers(annotation, 'Rect', lib, 4);
      const bbox = numbers(appearance.stream.dict, 'BBox', lib, 4);
      const matrix = numbers(appearance.stream.dict, 'Matrix', lib, 6)
        ?? [1, 0, 0, 1, 0, 0];
      const transform = rect && bbox ? placement(bbox, matrix, rect) : null;
      if (!transform) {
        throw new Error(`Cannot flatten native ${subtype ?? 'unknown'} annotation on page ${index + 1}: invalid appearance geometry`);
      }

      // Preserve the exact original appearance stream and its font/image
      // resources; only its placement CTM is appended to the parent page.
      const xObjectName = page.node.newXObject('PdfHubFlatAnnot', appearance.ref);
      const alpha = annotation.lookupMaybe(lib.PDFName.of('CA'), lib.PDFNumber)?.asNumber();
      const alphaName = alpha !== undefined && Number.isFinite(alpha)
        && alpha >= 0 && alpha < 1
          ? page.node.newExtGState('PdfHubFlatAnnotAlpha', pdf.context.obj({
              Type: 'ExtGState', ca: alpha, CA: alpha,
            }))
          : null;
      page.pushOperators(
        lib.pushGraphicsState(),
        ...(alphaName ? [lib.setGraphicsState(alphaName)] : []),
        ...((annotation.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0) & 16
          ? (() => {
              const compensation = noRotateCompensation(rect!, page.getRotation().angle);
              return compensation ? [lib.concatTransformationMatrix(...compensation)] : [];
            })()
          : []),
        lib.concatTransformationMatrix(...transform),
        lib.drawObject(xObjectName),
        lib.popGraphicsState(),
      );
    }
    if (links.length) page.node.set(lib.PDFName.of('Annots'), pdf.context.obj(links));
    else page.node.delete(lib.PDFName.of('Annots'));
  }
  return new Uint8Array(await pdf.save());
}
