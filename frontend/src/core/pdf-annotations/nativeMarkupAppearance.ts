import type { PdfAnnotation } from '@/core/annotations/types';
import { MAX_PREVIEW_MARKUP_QUADS, squiggleSegmentBudget, squiggleWave } from '@/core/annotations/squigglyGeometry';

type PDFDict = import('pdf-lib').PDFDict;
type PDFDocument = import('pdf-lib').PDFDocument;
type Lib = typeof import('pdf-lib');
interface Color { r: number; g: number; b: number }

/**
 * A native /AP /N Form XObject is required for the supported markup/mask
 * output. It stays attached to the /Annot dictionary; it never changes
 * underlying page content or claims to securely redact source text.
 *
 * /QuadPoints coordinates are in PDF user space. The form's local origin is
 * the annotation /Rect lower-left; /BBox and /Matrix are finite/explicit.
 */
export function attachNativeMarkupAppearance(
  doc: PDFDocument,
  dict: PDFDict,
  annotation: PdfAnnotation,
  rect: [number, number, number, number],
  quads: number[],
  color: Color,
  opacity: number,
  borderWidth: number,
  lib: Lib,
): void {
  const type = annotation.type;
  if (type !== 'highlight' && type !== 'underline'
    && type !== 'strikeout' && type !== 'squiggly' && type !== 'redaction') return;
  const key = lib.PDFName.of('AP');
  // Preserve original opaque native AP on byte-equivalent re-save when
  // preservePassiveAnnotationEntries has already decided it is still valid.
  if (dict.get(key)) return;

  const [left, bottom, right, top] = rect;
  const width = right - left;
  const height = top - bottom;
  if (![left, bottom, right, top, opacity].every(Number.isFinite)
    || width <= 0 || height <= 0) {
    throw new Error('INVALID_MARKUP_APPEARANCE_GEOMETRY');
  }
  if (type !== 'redaction' && (quads.length < 8 || quads.length % 8 !== 0
    || !quads.every(Number.isFinite))) {
    throw new Error('INVALID_MARKUP_APPEARANCE_QUADS');
  }
  if (type === 'squiggly' && quads.length > MAX_PREVIEW_MARKUP_QUADS * 8) {
    throw new Error(`Cannot generate a squiggly appearance with more than ${MAX_PREVIEW_MARKUP_QUADS} text regions.`);
  }

  const f = (value: number) => String(Number(value.toFixed(5)));
  const local = (x: number, y: number) => [f(x - left), f(y - bottom)].join(' ');
  const clampedOpacity = type === 'redaction' ? 1 : Math.min(1, Math.max(0, opacity));
  const rgb = type === 'redaction' ? '0 0 0'
    : [color.r, color.g, color.b].map(f).join(' ');
  const commands: string[] = ['q', '/GS0 gs', rgb + ' ' + (type === 'highlight' || type === 'redaction' ? 'rg' : 'RG')];

  if (type === 'redaction') {
    commands.push('0 0 ' + f(width) + ' ' + f(height) + ' re f');
  } else {
    const lineWidth = Math.min(5, Math.max(0.5, borderWidth));
    commands.push(f(lineWidth) + ' w', '1 J');
    for (let i = 0; i < quads.length; i += 8) {
      // PDF convention: top-left, top-right, bottom-left, bottom-right.
      const [tlx, tly, trx, try_, blx, bly, brx, bry] = quads.slice(i, i + 8);
      if (type === 'highlight') {
        commands.push(
          local(tlx, tly) + ' m ' + local(trx, try_) + ' l '
          + local(brx, bry) + ' l ' + local(blx, bly) + ' l h f',
        );
        continue;
      }
      const fraction = type === 'strikeout' ? 0.55 : 0.16;
      const sx = blx + fraction * (tlx - blx);
      const sy = bly + fraction * (tly - bly);
      const ex = brx + fraction * (trx - brx);
      const ey = bry + fraction * (try_ - bry);

      if (type === 'underline' || type === 'strikeout') {
        commands.push(local(sx, sy) + ' m ' + local(ex, ey) + ' l S');
        continue;
      }
      // Squiggly: alternating native line segments along the rotated
      // baseline, deflected in the actual top-versus-bottom direction.
      const length = Math.hypot(ex - sx, ey - sy);
      const textHeight = Math.max(1, Math.hypot(tlx - blx, tly - bly));
      const nx = (tlx - blx) / textHeight;
      const ny = (tly - bly) / textHeight;
      commands.push(local(sx, sy) + ' m');
      const wave = squiggleWave(length, textHeight, squiggleSegmentBudget(quads.length / 8));
      for (const { fraction, displacement } of wave.slice(1)) {
        commands.push(local(
          sx + (ex - sx) * fraction + nx * displacement,
          sy + (ey - sy) * fraction + ny * displacement,
        ) + ' l');
      }
      commands.push('S');
    }
  }
  commands.push('Q');

  const gsRef = doc.context.register(doc.context.obj({
    Type: 'ExtGState',
    ca: clampedOpacity,
    CA: clampedOpacity,
  }));
  const stream = doc.context.flateStream(commands.join('\n') + '\n', {
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [0, 0, width, height],
    Matrix: [1, 0, 0, 1, 0, 0],
    Resources: { ExtGState: { GS0: gsRef } },
  });
  const appearanceRef = doc.context.register(stream);
  dict.set(key, doc.context.obj({ N: appearanceRef }));
}

export async function attachNativeStampAppearance(
  doc: PDFDocument,
  dict: PDFDict,
  annotation: PdfAnnotation,
  geometry: { width: number; height: number; space?: { rotation: 0 | 90 | 180 | 270 } },
  color: Color,
  fill: Color,
  textColor: Color,
  opacity: number,
  lib: Lib,
): Promise<void> {
  if (annotation.type !== 'stamp') return;
  const key = lib.PDFName.of('AP');
  // Preserve original appearance if already present (e.g. from imported passive stream)
  if (dict.get(key)) return;

  // Stamp text is laid out in the displayed page's coordinates.  PDF /Rect
  // uses unrotated page axes, which swap on quarter-turned pages; using those
  // dimensions here would shrink and rotate the text on an otherwise normal
  // horizontal stamp.  Transform the Form back into PDF page coordinates.
  const pageRotation = geometry.space?.rotation ?? 0;
  const basis = annotation.data.nativeStampBasisRotation ?? pageRotation;
  if (![0, 90, 180, 270].includes(basis)) throw new Error('Cannot render native stamp: invalid page orientation.');
  const relative = ((pageRotation - basis) + 360) % 360;
  const sideways = relative === 90 || relative === 270;
  const width = Math.max(20, sideways ? annotation.rect.height : annotation.rect.width);
  const height = Math.max(12, sideways ? annotation.rect.width : annotation.rect.height);
  const matrix = basis === 90 ? [0, 1, -1, 0, height, 0]
    : basis === 180 ? [-1, 0, 0, -1, width, height]
      : basis === 270 ? [0, -1, 1, 0, 0, width]
        : [1, 0, 0, 1, 0, 0];
  const text = (
    typeof annotation.data.text === 'string' && annotation.data.text.trim()
      ? annotation.data.text.trim()
      : 'APPROVED'
  );
  if (annotation.data.stampImageDataUrl) throw new Error('Cannot render native stamp: image stamps are not supported yet.');
  const font = await doc.embedFont(lib.StandardFonts.HelveticaBold);
  let encoded: string;
  let unitTextWidth: number;
  try {
    encoded = font.encodeText(text).toString();
    unitTextWidth = font.widthOfTextAtSize(text, 1);
  } catch {
    throw new Error('Cannot render native stamp: its text contains unsupported characters.');
  }
  // Provenance is sealed before the document is saved, so the referenced font
  // object must already be present in the graph rather than deferred to flush.
  await font.embed();

  const f = (value: number) => String(Number(value.toFixed(5)));
  const clampedOpacity = Math.min(1, Math.max(0, opacity));
  const strokeRgb = [color.r, color.g, color.b].map(f).join(' ');
  const fillRgb = [fill.r, fill.g, fill.b].map(f).join(' ');
  const textRgb = [textColor.r, textColor.g, textColor.b].map(f).join(' ');

  const preferredFontSize = typeof annotation.data.fontSize === 'number'
    ? Math.max(8, Math.min(36, annotation.data.fontSize))
    : 14;
  const fontSize = Math.min(preferredFontSize, (height - 6) * 0.8, (width - 8) / Math.max(unitTextWidth, 0.01));
  if (fontSize < 4) throw new Error('Cannot render native stamp: its text is too long for the stamp.');
  const textX = (width - unitTextWidth * fontSize) / 2;
  const textY = (height - font.heightAtSize(fontSize)) / 2 + fontSize * 0.2;

  const commands: string[] = [
    'q',
    '/GS0 gs',
    ...(annotation.data.backgroundColor && annotation.data.backgroundColor !== 'transparent'
      ? [`${fillRgb} rg`, `0 0 ${f(width)} ${f(height)} re f`] : []),
    '2 w',
    strokeRgb + ' RG',
    '1 1 ' + f(width - 2) + ' ' + f(height - 2) + ' re S',
    'BT',
    '/F1 ' + f(fontSize) + ' Tf',
    textRgb + ' rg',
    f(textX) + ' ' + f(textY) + ' Td',
    `${encoded} Tj`,
    'ET',
    'Q',
  ];

  const gsRef = doc.context.register(doc.context.obj({
    Type: 'ExtGState',
    ca: clampedOpacity,
    CA: clampedOpacity,
  }));
  const stream = doc.context.flateStream(commands.join('\n') + '\n', {
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [0, 0, width, height],
    Matrix: matrix,
    Resources: {
      ExtGState: { GS0: gsRef },
      Font: { F1: font.ref },
      ProcSet: ['PDF', 'Text'],
    },
  });
  const appearanceRef = doc.context.register(stream);
  dict.set(key, doc.context.obj({ N: appearanceRef }));
}
