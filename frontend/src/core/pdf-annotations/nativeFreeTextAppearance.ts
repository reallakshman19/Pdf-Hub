import type { PDFDict, PDFDocument, PDFFont, PDFRef } from 'pdf-lib';
import type { PdfAnnotation } from '@/core/annotations/types';
import { calloutBodyRect } from './freeTextGeometry';
import { makeTextlessUnderlay } from './nativeAppearanceUnderlay';
import { computeFileHash } from '@/core/document/fileHash';

type Lib = typeof import('pdf-lib');
type Color = { r: number; g: number; b: number };
type Align = 'left' | 'center' | 'right';
type Face = 'sans' | 'serif' | 'mono';
interface TextStyle { size: number; color: Color; face: Face; bold: boolean; italic: boolean; align: Align }
interface Run { text: string; style: TextStyle }
interface Line { runs: Array<Run & { width: number; font: PDFFont; key: string }>; width: number; minX: number; maxX: number; size: number; align: Align }

// Horizontal FontBBox limits, in thousandths of an em, from the Adobe
// standard-font metrics used by pdf-lib. Advance width alone does not bound
// the painted glyph (notably italic f). These font-wide limits are deliberately
// conservative: a glyph-specific box could use less space, but no such boxes
// are exposed by pdf-lib's standard-font metrics.
const horizontalFontBounds: Record<Face, readonly (readonly [number, number])[]> = {
  sans: [[-166, 1000], [-170, 1003], [-170, 1116], [-174, 1114]],
  serif: [[-168, 1000], [-168, 1000], [-169, 1010], [-200, 996]],
  mono: [[-23, 715], [-113, 749], [-27, 849], [-57, 869]],
};

function horizontalBounds(style: TextStyle): readonly [number, number] {
  return horizontalFontBounds[style.face][(style.bold ? 1 : 0) + (style.italic ? 2 : 0)];
}

const fontCaches = new WeakMap<PDFDocument, Map<string, Promise<PDFFont>>>();

function parseColor(value: string): Color {
  const hex = value.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
    throw new Error('Cannot render native rich text: unsupported text color.');
  }
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  return { r: parseInt(full.slice(0, 2), 16) / 255, g: parseInt(full.slice(2, 4), 16) / 255, b: parseInt(full.slice(4, 6), 16) / 255 };
}

function styled(parent: TextStyle, element: Element): TextStyle {
  const result = { ...parent };
  for (const declaration of (element.getAttribute('style') ?? '').split(';')) {
    if (!declaration.trim()) continue;
    const colon = declaration.indexOf(':');
    if (colon < 0) throw new Error('Cannot render native rich text: invalid style.');
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim().toLowerCase();
    switch (property) {
      case 'font-family': {
        const family = value.replace(/["']/g, '').split(',')[0].trim();
        if (['arial', 'helvetica', 'sans-serif'].includes(family)) result.face = 'sans';
        else if (['times', 'times new roman', 'serif'].includes(family)) result.face = 'serif';
        else if (['courier', 'courier new', 'monospace'].includes(family)) result.face = 'mono';
        else throw new Error(`Cannot render native rich text: unsupported font family ${family}.`);
        break;
      }
      case 'font-size': {
        const match = /^(\d+(?:\.\d+)?)(?:pt)?$/.exec(value);
        const size = match ? Number(match[1]) : NaN;
        if (!Number.isFinite(size) || size < 1 || size > 144) throw new Error('Cannot render native rich text: unsupported font size.');
        result.size = size;
        break;
      }
      case 'font-weight':
        if (value === 'normal' || value === '400') result.bold = false;
        else if (value === 'bold' || value === '700') result.bold = true;
        else throw new Error('Cannot render native rich text: unsupported font weight.');
        break;
      case 'font-style':
        if (value === 'normal') result.italic = false;
        else if (value === 'italic' || value === 'oblique') result.italic = true;
        else throw new Error('Cannot render native rich text: unsupported font style.');
        break;
      case 'font-stretch':
        if (value !== 'normal') throw new Error('Cannot render native rich text: unsupported font stretch.');
        break;
      case 'text-align':
        if (value !== 'left' && value !== 'center' && value !== 'right') throw new Error('Cannot render native rich text: unsupported alignment.');
        result.align = value;
        break;
      case 'color': result.color = parseColor(value); break;
      default: throw new Error(`Cannot render native rich text: unsupported style ${property}.`);
    }
  }
  return result;
}

function richParagraphs(xml: string, fallback: TextStyle): Run[][] {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('Cannot render native rich text: invalid XHTML.');
  const body = document.documentElement.localName === 'body'
    ? document.documentElement : document.getElementsByTagNameNS('*', 'body')[0];
  if (!body) throw new Error('Cannot render native rich text: missing body.');
  const bodyStyle = styled(fallback, body);
  const paragraphs: Run[][] = [];
  const collect = (node: Node, inherited: TextStyle, runs: Run[]): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) runs.push({ text: node.textContent, style: inherited });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) throw new Error('Cannot render native rich text: unsupported content.');
    const element = node as Element;
    if (element.localName === 'br' && element.childNodes.length === 0) {
      runs.push({ text: '\n', style: inherited });
      return;
    }
    if (!['p', 'span'].includes(element.localName)) throw new Error('Cannot render native rich text: unsupported structure.');
    const current = styled(inherited, element);
    for (const child of Array.from(element.childNodes)) collect(child, current, runs);
  };
  let inline: Run[] = [];
  let hasInline = false;
  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).localName === 'p') {
      if (hasInline) paragraphs.push(inline);
      inline = []; hasInline = false;
      const runs: Run[] = [];
      collect(child, bodyStyle, runs);
      paragraphs.push(runs);
    } else {
      collect(child, bodyStyle, inline);
      hasInline = true;
    }
  }
  if (hasInline) paragraphs.push(inline);
  return paragraphs.length ? paragraphs : [[{ text: '', style: bodyStyle }]];
}

async function fontFor(doc: PDFDocument, style: TextStyle, lib: Lib): Promise<{ font: PDFFont; key: string }> {
  const key = `${style.face}-${style.bold ? 'bold' : 'normal'}-${style.italic ? 'italic' : 'normal'}`;
  let cache = fontCaches.get(doc);
  if (!cache) { cache = new Map(); fontCaches.set(doc, cache); }
  if (!cache.has(key)) {
    const names = style.face === 'mono'
      ? [lib.StandardFonts.Courier, lib.StandardFonts.CourierBold, lib.StandardFonts.CourierOblique, lib.StandardFonts.CourierBoldOblique]
      : style.face === 'serif'
        ? [lib.StandardFonts.TimesRoman, lib.StandardFonts.TimesRomanBold, lib.StandardFonts.TimesRomanItalic, lib.StandardFonts.TimesRomanBoldItalic]
        : [lib.StandardFonts.Helvetica, lib.StandardFonts.HelveticaBold, lib.StandardFonts.HelveticaOblique, lib.StandardFonts.HelveticaBoldOblique];
    cache.set(key, doc.embedFont(names[(style.bold ? 1 : 0) + (style.italic ? 2 : 0)]));
  }
  return { font: await cache.get(key)!, key };
}

function numberArray(dict: PDFDict, key: string, lib: Lib): number[] | null {
  const array = dict.lookupMaybe(lib.PDFName.of(key), lib.PDFArray);
  if (!array) return null;
  const result: number[] = [];
  for (let i = 0; i < array.size(); i += 1) {
    const number = array.lookupMaybe(i, lib.PDFNumber);
    if (!number || !Number.isFinite(number.asNumber())) return null;
    result.push(number.asNumber());
  }
  return result;
}

/** Build an editable FreeText annotation's normal appearance, not page content. */
export async function attachNativeFreeTextAppearance(
  doc: PDFDocument,
  dict: PDFDict,
  annotation: PdfAnnotation,
  rect: [number, number, number, number],
  stroke: Color,
  fill: Color,
  opacity: number,
  borderWidth: number,
  lib: Lib,
  preserveGraphicsFrom?: PDFDict,
): Promise<void> {
  if (annotation.type !== 'textbox' && annotation.type !== 'callout') return;
  if (dict.get(lib.PDFName.of('AP'))) return;
  const [left, bottom, right, top] = rect;
  const width = right - left; const height = top - bottom;
  if (!(width > 0 && height > 0)) throw new Error('Cannot render native text: invalid geometry.');
  const rd = numberArray(dict, 'RD', lib) ?? [0, 0, 0, 0];
  if (rd.length !== 4 || rd.some((n) => n < 0) || rd[0] + rd[2] >= width || rd[1] + rd[3] >= height) {
    throw new Error('Cannot render native text: invalid inner rectangle.');
  }
  const leader = annotation.type === 'callout' ? numberArray(dict, 'CL', lib) : null;
  const localLeader = leader?.map((value, index) => value - (index % 2 === 0 ? left : bottom)) ?? null;
  const body = calloutBodyRect([0, 0, width, height], rd, localLeader);
  if (!body) throw new Error('Cannot render native text: invalid text rectangle.');
  if (typeof annotation.data.fontSize === 'number'
    && (!Number.isFinite(annotation.data.fontSize) || annotation.data.fontSize < 1 || annotation.data.fontSize > 144)) {
    throw new Error('Cannot render native text: unsupported font size.');
  }
  const fallback: TextStyle = {
    size: typeof annotation.data.fontSize === 'number' ? annotation.data.fontSize : 12,
    color: annotation.data.textColor ? parseColor(annotation.data.textColor) : { r: 0, g: 0, b: 0 },
    face: 'sans', bold: annotation.data.fontWeight === 'bold', italic: annotation.data.fontStyle === 'italic',
    align: annotation.data.textAlign ?? 'left',
  };
  const rc = dict.lookup(lib.PDFName.of('RC'));
  const rich = rc instanceof lib.PDFString || rc instanceof lib.PDFHexString ? rc.decodeText() : null;
  const paragraphs = rich ? richParagraphs(rich, fallback)
    : (annotation.data.text ?? '').replace(/\r\n?/g, '\n').split('\n').map((text) => [{ text, style: fallback }]);

  const padding = 2;
  const orientation = ((360 - (annotation.data.nativeOrientationAdjustment ?? 0)) % 360 + 360) % 360;
  if (![0, 90, 180, 270].includes(orientation)) throw new Error('Cannot render native text: unsupported copied-page orientation.');
  const bodyWidth = body[2] - body[0]; const bodyHeight = body[3] - body[1];
  const layoutWidth = orientation % 180 ? bodyHeight : bodyWidth;
  const layoutHeight = orientation % 180 ? bodyWidth : bodyHeight;
  const x0 = padding; const x1 = layoutWidth - padding;
  const topY = layoutHeight - padding; const bottomY = padding;
  if (!(x1 > x0 && topY > bottomY)) throw new Error('Cannot render native text: text box is too small.');
  const usedFonts = new Map<string, PDFFont>();
  const prepared = await Promise.all(paragraphs.map((paragraph) => Promise.all(paragraph.map(async (run) => {
      const { font, key } = await fontFor(doc, run.style, lib);
      usedFonts.set(key, font);
      return { ...run, font, key };
  }))));
  const widths = new Map<string, number>();
  const layout = (factor: number): Line[] | null => {
    const result: Line[] = [];
    for (const paragraph of prepared) {
      let line: Line = { runs: [], width: 0, minX: 0, maxX: 0, size: 0, align: paragraph[0]?.style.align ?? fallback.align };
      const pushLine = () => {
        if (line.size === 0) line.size = fallback.size * factor;
        result.push(line);
        line = { runs: [], width: 0, minX: 0, maxX: 0, size: 0, align: line.align };
      };
      for (const run of paragraph) {
        const style = { ...run.style, size: run.style.size * factor };
        for (const character of Array.from(run.text)) {
          if (character === '\r') continue;
          if (character === '\n') { pushLine(); continue; }
          const widthKey = `${run.key}\u0000${character}`;
          let unitWidth = widths.get(widthKey);
          if (unitWidth === undefined) {
            try { unitWidth = run.font.widthOfTextAtSize(character, 1); }
            catch { throw new Error('Cannot render native text: a character is unsupported by the available PDF fonts.'); }
            widths.set(widthKey, unitWidth);
          }
          const characterWidth = unitWidth * style.size;
          // Spaces have no ink; their advance still participates in layout.
          const [fontMin, fontMax] = horizontalBounds(style);
          const hasInk = !/^[\s\u00a0]$/u.test(character);
          const extent = () => ({
            min: Math.min(line.minX, hasInk ? line.width + fontMin * style.size / 1000 : line.width),
            max: Math.max(line.maxX, line.width + characterWidth, hasInk ? line.width + fontMax * style.size / 1000 : line.width),
          });
          let bounds = extent();
          if (bounds.max - bounds.min > x1 - x0 && line.runs.length) { pushLine(); bounds = extent(); }
          if (bounds.max - bounds.min > x1 - x0) return null;
          const last = line.runs[line.runs.length - 1];
          if (last && last.key === run.key && last.style === style) { last.text += character; last.width += characterWidth; }
          else line.runs.push({ text: character, style, width: characterWidth, font: run.font, key: run.key });
          line.width += characterWidth;
          line.minX = bounds.min;
          line.maxX = bounds.max;
          line.size = Math.max(line.size, style.size);
        }
      }
      pushLine();
    }
    return result;
  };
  const lineMetrics = (line: Line) => {
    let ascent = line.size; let descent = 0;
    for (const run of line.runs) {
      const above = run.font.heightAtSize(run.style.size, { descender: false });
      const total = run.font.heightAtSize(run.style.size, { descender: true });
      ascent = Math.max(ascent, above);
      descent = Math.max(descent, total - above);
    }
    return { ascent, descent, gap: line.size * 0.1 };
  };
  const fits = (candidate: Line[] | null) => Boolean(candidate
    && candidate.reduce((heightUsed, line) => {
      const { ascent, descent, gap } = lineMetrics(line);
      return heightUsed + ascent + descent + gap;
    }, 0) <= topY - bottomY + 1e-6);
  let textScale = 1;
  let lines = layout(textScale);
  if (!fits(lines)) {
    const sizes = prepared.flatMap((paragraph) => paragraph.map((run) => run.style.size)).filter((size) => size > 0);
    const smallest = Math.min(fallback.size, ...sizes);
    const minimum = Math.min(1, 4 / smallest);
    let best = layout(minimum);
    if (!fits(best)) throw new Error('Cannot fit the annotation text in its box. Enlarge the box or shorten the text.');
    let low = minimum; let high = 1;
    for (let step = 0; step < 16; step += 1) {
      const middle = (low + high) / 2;
      const candidate = layout(middle);
      if (fits(candidate)) { low = middle; best = candidate; } else high = middle;
    }
    textScale = low;
    lines = best;
  }
  if (!lines) throw new Error('Cannot fit the annotation text in its box.');
  const f = (n: number) => String(Number(n.toFixed(5)));
  const rgb = (c: Color) => [c.r, c.g, c.b].map(f).join(' ');
  const commands = ['q'];
  const underlay = preserveGraphicsFrom ? await makeTextlessUnderlay(doc, preserveGraphicsFrom, lib) : null;
  if (underlay) {
    const [a, b, c, d, e, f0] = underlay.matrix;
    const [xMin, yMin, xMax, yMax] = underlay.bbox;
    const corners = [[xMin, yMin], [xMin, yMax], [xMax, yMin], [xMax, yMax]]
      .map(([x, y]) => [a * x + c * y + e, b * x + d * y + f0]);
    const minX = Math.min(...corners.map((point) => point[0]));
    const minY = Math.min(...corners.map((point) => point[1]));
    const maxX = Math.max(...corners.map((point) => point[0]));
    const maxY = Math.max(...corners.map((point) => point[1]));
    if (!(maxX > minX && maxY > minY)) throw new Error('Cannot safely edit native appearance: degenerate form transform.');
    const sx = width / (maxX - minX); const sy = height / (maxY - minY);
    commands.push('q', `${f(sx)} 0 0 ${f(sy)} ${f(-minX * sx)} ${f(-minY * sy)} cm`, '/OriginalGraphics Do', 'Q');
  }
  // The original form already contains its graphics state. Apply the edited
  // annotation opacity only to newly drawn content, not repeatedly to it.
  commands.push('/GS0 gs');
  if (!underlay && annotation.data.backgroundColor) {
    commands.push(`${rgb(fill)} rg`, `${f(body[0])} ${f(body[1])} ${f(body[2] - body[0])} ${f(body[3] - body[1])} re f`);
  }
  if (!underlay && borderWidth > 0) {
    commands.push(`${rgb(stroke)} RG`, `${f(borderWidth)} w`, `${f(body[0])} ${f(body[1])} ${f(body[2] - body[0])} ${f(body[3] - body[1])} re S`);
  }
  if (!underlay && annotation.type === 'callout') {
    const cl = numberArray(dict, 'CL', lib);
    if (cl && (cl.length === 4 || cl.length === 6)) {
      const points = Array.from({ length: cl.length / 2 }, (_, i) => [cl[i * 2] - left, cl[i * 2 + 1] - bottom]);
      if (points.some(([x, y]) => x < -0.01 || y < -0.01 || x > width + 0.01 || y > height + 0.01)) {
        throw new Error('Cannot render native callout: the leader lies outside its annotation rectangle.');
      }
      commands.push(`${rgb(stroke)} RG`, `${f(Math.max(borderWidth, 0.5))} w`, `${f(points[0][0])} ${f(points[0][1])} m`);
      for (const point of points.slice(1)) commands.push(`${f(point[0])} ${f(point[1])} l`);
      commands.push('S');
      const ending = dict.get(lib.PDFName.of('LE'))?.toString();
      if (ending && ending !== '/None') {
        if (ending !== '/OpenArrow' && ending !== '/ClosedArrow') throw new Error('Cannot render native callout: unsupported leader ending.');
        const [tip, next] = points;
        const angle = Math.atan2(next[1] - tip[1], next[0] - tip[0]);
        const length = Math.min(8, Math.max(3, width / 8));
        const a = [tip[0] + length * Math.cos(angle + Math.PI / 6), tip[1] + length * Math.sin(angle + Math.PI / 6)];
        const b = [tip[0] + length * Math.cos(angle - Math.PI / 6), tip[1] + length * Math.sin(angle - Math.PI / 6)];
        commands.push(`${f(a[0])} ${f(a[1])} m ${f(tip[0])} ${f(tip[1])} l ${f(b[0])} ${f(b[1])} l ${ending === '/ClosedArrow' ? 'h B' : 'S'}`);
      }
    }
  }
  const fontKeys = [...usedFonts.keys()];
  const resources: Record<string, PDFRef> = {};
  fontKeys.forEach((key, index) => { resources[`F${index}`] = usedFonts.get(key)!.ref; });
  // Clip to the text rectangle as a last defense against faulty renderers;
  // layout reserves conservative glyph bounds before this clip is applied.
  const transform = orientation === 90 ? [0, 1, -1, 0, body[2], body[1]]
    : orientation === 180 ? [-1, 0, 0, -1, body[2], body[3]]
      : orientation === 270 ? [0, -1, 1, 0, body[0], body[3]] : [1, 0, 0, 1, body[0], body[1]];
  commands.push('q', `${f(body[0] + padding)} ${f(body[1] + padding)} ${f(bodyWidth - 2 * padding)} ${f(bodyHeight - 2 * padding)} re W n`, `${transform.map(f).join(' ')} cm`);
  let y = topY;
  for (const line of lines) {
    const { ascent, descent, gap } = lineMetrics(line);
    y -= ascent;
    const paintedWidth = line.maxX - line.minX;
    let x = (line.align === 'center' ? x0 + (x1 - x0 - paintedWidth) / 2
      : line.align === 'right' ? x1 - paintedWidth : x0) - line.minX;
    for (const run of line.runs) {
      const name = `F${fontKeys.indexOf(run.key)}`;
      commands.push('BT', `/${name} ${f(run.style.size)} Tf`, `${rgb(run.style.color)} rg`, `1 0 0 1 ${f(x)} ${f(y)} Tm`, `${run.font.encodeText(run.text)} Tj`, 'ET');
      x += run.width;
    }
    y -= descent + gap;
  }
  commands.push('Q', 'Q');
  const gs = doc.context.register(doc.context.obj({ Type: 'ExtGState', ca: opacity, CA: opacity }));
  const content = `${commands.join('\n')}\n`;
  const appearanceHash = underlay ? await computeFileHash(new TextEncoder().encode(content)) : null;
  const stream = doc.context.flateStream(content, {
    Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: [0, 0, width, height],
    Matrix: [1, 0, 0, 1, 0, 0], Resources: {
      Font: resources, ExtGState: { GS0: gs },
      ...(underlay ? { XObject: { OriginalGraphics: underlay.ref } } : {}),
    },
    ...(underlay && appearanceHash ? { PDFHubTextUnderlay: underlay.ref, PDFHubAppearanceSHA256: lib.PDFString.of(appearanceHash) } : {}),
    PDFHubTextFitScale: Number(textScale.toFixed(6)),
  });
  dict.set(lib.PDFName.of('AP'), doc.context.obj({ N: doc.context.register(stream) }));
}
