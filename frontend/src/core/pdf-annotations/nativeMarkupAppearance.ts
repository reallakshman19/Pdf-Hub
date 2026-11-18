import type { PDFDict, PDFDocument } from 'pdf-lib';
import type { PdfAnnotation } from '@/core/annotations/types';

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
      const steps = Math.max(4, Math.min(256, Math.ceil(length / 4)));
      const textHeight = Math.max(1, Math.hypot(tlx - blx, tly - bly));
      const amplitude = Math.min(1.8, textHeight * 0.10);
      const nx = (tlx - blx) / textHeight;
      const ny = (tly - bly) / textHeight;
      commands.push(local(sx, sy) + ' m');
      for (let step = 1; step <= steps; step += 1) {
        const fractionAlong = step / steps;
        const displacement = step === steps ? 0 : (step % 2 === 0 ? -1 : 1) * amplitude;
        commands.push(local(
          sx + (ex - sx) * fractionAlong + nx * displacement,
          sy + (ey - sy) * fractionAlong + ny * displacement,
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
