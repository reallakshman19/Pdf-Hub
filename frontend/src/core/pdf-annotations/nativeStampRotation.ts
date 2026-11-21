import type { PdfAnnotation } from '@/core/annotations/types';
import type { PdfRect } from './freeTextGeometry';

type PDFDict = import('pdf-lib').PDFDict;
type PDFDocument = import('pdf-lib').PDFDocument;
type Lib = typeof import('pdf-lib');

function numbers(dict: PDFDict, key: string, lib: Lib): number[] | null {
  const array = dict.lookupMaybe(lib.PDFName.of(key), lib.PDFArray);
  if (!array) return null;
  const values: number[] = [];
  for (let i = 0; i < array.size(); i += 1) {
    const item = array.lookupMaybe(i, lib.PDFNumber);
    if (!item || !Number.isFinite(item.asNumber())) return null;
    values.push(item.asNumber());
  }
  return values;
}

/** Rotate the native form, retaining the original appearance for future edits. */
export function applyNativeStampRotation(
  doc: PDFDocument,
  dict: PDFDict,
  source: PDFDict | null,
  annotation: PdfAnnotation,
  baseRect: PdfRect,
  lib: Lib,
): void {
  if (annotation.type !== 'stamp') return;
  const requested = annotation.data.rotation ?? 0;
  if (!Number.isFinite(requested)) throw new Error('Cannot safely rotate a stamp: invalid angle.');
  const angle = ((requested % 360) + 360) % 360;
  const previous = source?.lookupMaybe(lib.PDFName.of('PDFHubRotation'), lib.PDFNumber)?.asNumber() ?? 0;
  const previousBaseRect = source ? numbers(source, 'PDFHubBaseRect', lib) : null;
  const currentAppearance = dict.get(lib.PDFName.of('AP'));
  const sourceAppearance = source?.get(lib.PDFName.of('AP'));
  const retainedSource = Boolean(currentAppearance && sourceAppearance && currentAppearance === sourceAppearance);
  const baseAppearance = (retainedSource ? source?.get(lib.PDFName.of('PDFHubBaseAP')) : undefined) ?? currentAppearance;
  if (angle === 0 && previous === 0) return;
  if (!baseAppearance) throw new Error('Cannot safely rotate a stamp without a native appearance.');

  const ap = doc.context.lookup(baseAppearance);
  if (!(ap instanceof lib.PDFDict) || ap.keys().some((key) => key.decodeText() !== 'N')) {
    throw new Error('Cannot safely rotate a stamp with unsupported appearance states.');
  }
  const normalRef = ap.get(lib.PDFName.of('N'));
  const normal = doc.context.lookup(normalRef);
  if (!(normal instanceof lib.PDFStream) || !normalRef) throw new Error('Cannot safely rotate a stamp with unsupported appearance states.');
  if (angle === 0) {
    dict.set(lib.PDFName.of('AP'), baseAppearance);
    dict.set(lib.PDFName.of('Rect'), doc.context.obj(baseRect));
    return;
  }
  const previousSizeMatches = previousBaseRect?.length === 4
    && Math.abs((previousBaseRect[2] - previousBaseRect[0]) - (baseRect[2] - baseRect[0])) < 1e-4
    && Math.abs((previousBaseRect[3] - previousBaseRect[1]) - (baseRect[3] - baseRect[1])) < 1e-4;
  if (retainedSource && previousSizeMatches && Math.abs(previous - angle) < 1e-7 && source?.get(lib.PDFName.of('PDFHubBaseAP'))) {
    const radians = angle * Math.PI / 180;
    const width = baseRect[2] - baseRect[0]; const height = baseRect[3] - baseRect[1];
    const rotatedWidth = Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height;
    const rotatedHeight = Math.abs(Math.sin(radians)) * width + Math.abs(Math.cos(radians)) * height;
    const x = (baseRect[0] + baseRect[2]) / 2; const y = (baseRect[1] + baseRect[3]) / 2;
    dict.set(lib.PDFName.of('Rect'), doc.context.obj([x - rotatedWidth / 2, y - rotatedHeight / 2, x + rotatedWidth / 2, y + rotatedHeight / 2]));
    dict.set(lib.PDFName.of('PDFHubBaseAP'), baseAppearance);
    dict.set(lib.PDFName.of('PDFHubBaseRect'), doc.context.obj(baseRect));
    dict.set(lib.PDFName.of('PDFHubRotation'), lib.PDFNumber.of(angle));
    return;
  }

  const bbox = numbers(normal.dict, 'BBox', lib);
  const matrix = numbers(normal.dict, 'Matrix', lib) ?? [1, 0, 0, 1, 0, 0];
  if (!bbox || bbox.length !== 4 || matrix.length !== 6) throw new Error('Cannot safely rotate a stamp with invalid appearance geometry.');
  const [a, b, c, d, e, f] = matrix;
  const corners = [[bbox[0], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[1]], [bbox[2], bbox[3]]]
    .map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
  const minX = Math.min(...corners.map((point) => point[0]));
  const minY = Math.min(...corners.map((point) => point[1]));
  const maxX = Math.max(...corners.map((point) => point[0]));
  const maxY = Math.max(...corners.map((point) => point[1]));
  const width = baseRect[2] - baseRect[0]; const height = baseRect[3] - baseRect[1];
  if (!(width > 0 && height > 0 && maxX > minX && maxY > minY)) throw new Error('Cannot safely rotate a stamp with degenerate geometry.');
  const sx = width / (maxX - minX); const sy = height / (maxY - minY);
  const round = (value: number) => Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(8));
  const radians = angle * Math.PI / 180;
  const cosine = round(Math.cos(radians)); const sine = round(Math.sin(radians));
  const rotatedWidth = Math.abs(cosine) * width + Math.abs(sine) * height;
  const rotatedHeight = Math.abs(sine) * width + Math.abs(cosine) * height;
  const centerX = (baseRect[0] + baseRect[2]) / 2; const centerY = (baseRect[1] + baseRect[3]) / 2;
  const ref = normalRef instanceof lib.PDFRef ? normalRef : doc.context.register(normal);
  const fnum = (value: number) => String(round(value));
  const content = `q ${fnum(sx)} 0 0 ${fnum(sy)} ${fnum(-minX * sx)} ${fnum(-minY * sy)} cm /OriginalStamp Do Q\n`;
  const wrapper = doc.context.flateStream(content, {
    Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: [0, 0, width, height],
    // The UI uses clockwise screen-space angles; PDF user space has a
    // bottom-left origin, so the native form uses the opposite sign.
    Matrix: [cosine, -sine, sine, cosine, 0, 0], Resources: { XObject: { OriginalStamp: ref } },
  });
  dict.set(lib.PDFName.of('PDFHubBaseAP'), baseAppearance);
  dict.set(lib.PDFName.of('PDFHubBaseRect'), doc.context.obj(baseRect));
  dict.set(lib.PDFName.of('PDFHubRotation'), lib.PDFNumber.of(angle));
  dict.set(lib.PDFName.of('Rect'), doc.context.obj([
    centerX - rotatedWidth / 2, centerY - rotatedHeight / 2,
    centerX + rotatedWidth / 2, centerY + rotatedHeight / 2,
  ]));
  dict.set(lib.PDFName.of('AP'), doc.context.obj({ N: doc.context.register(wrapper) }));
}
