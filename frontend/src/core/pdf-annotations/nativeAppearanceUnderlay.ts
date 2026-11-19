import { computeFileHash } from '@/core/document/fileHash';

type PDFDict = import('pdf-lib').PDFDict;
type PDFDocument = import('pdf-lib').PDFDocument;
type PDFRawStream = import('pdf-lib').PDFRawStream;
type PDFRef = import('pdf-lib').PDFRef;
type Lib = typeof import('pdf-lib');
export interface TextlessUnderlay { ref: PDFRef; bbox: number[]; matrix: number[] }

/** Remove only complete PDF text objects, preserving every other byte. */
export function stripPdfTextObjects(input: Uint8Array, options: { allowedXObjects?: ReadonlySet<string>; requireText?: boolean; forbidText?: boolean } = {}): Uint8Array {
  const output = new Uint8Array(input);
  const white = (c: number) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
  const delimiter = (c: number) => white(c) || [40, 41, 60, 62, 91, 93, 123, 125, 47, 37].includes(c);
  let i = 0; let textStart = -1; let removed = 0; let lastName: string | null = null;
  while (i < input.length) {
    const c = input[i];
    if (white(c)) { i += 1; continue; }
    if (c === 37) { while (i < input.length && input[i] !== 10 && input[i] !== 13) i += 1; continue; }
    if (c === 40) {
      lastName = null;
      let depth = 1; i += 1;
      while (i < input.length && depth > 0) {
        if (input[i] === 92) { i += 2; continue; }
        if (input[i] === 40) depth += 1;
        if (input[i] === 41) depth -= 1;
        i += 1;
      }
      if (depth !== 0) throw new Error('Cannot safely edit native appearance: malformed PDF string.');
      continue;
    }
    if ((c === 60 && input[i + 1] === 60) || (c === 62 && input[i + 1] === 62)) { i += 2; continue; }
    if (c === 60) {
      lastName = null;
      i += 1;
      while (i < input.length && input[i] !== 62) i += 1;
      if (i >= input.length) throw new Error('Cannot safely edit native appearance: malformed hex string.');
      i += 1; continue;
    }
    if (c === 47) {
      const nameStart = ++i;
      while (i < input.length && !delimiter(input[i])) i += 1;
      lastName = '';
      for (let j = nameStart; j < i; j += 1) lastName += String.fromCharCode(input[j]);
      continue;
    }
    if (delimiter(c)) { i += 1; continue; }
    const start = i;
    while (i < input.length && !delimiter(input[i])) i += 1;
    let token = '';
    for (let j = start; j < i; j += 1) token += String.fromCharCode(input[j]);
    if (token === 'BI' || (token === 'Do' && (textStart >= 0 || !lastName || !options.allowedXObjects?.has(lastName)))) {
      throw new Error('Cannot safely edit native appearance: nested graphics require a fuller parser.');
    }
    if (token === 'BT') {
      if (options.forbidText) throw new Error('Cannot safely edit native appearance: graphics contain text.');
      if (textStart >= 0) throw new Error('Cannot safely edit native appearance: nested text object.');
      textStart = start;
    } else if (token === 'ET') {
      if (textStart < 0) throw new Error('Cannot safely edit native appearance: unmatched text object.');
      output.fill(32, textStart, i);
      textStart = -1;
      removed += 1;
    } else if (textStart >= 0 && (token === 'q' || token === 'Q')) {
      throw new Error('Cannot safely edit native appearance: graphics state crosses text boundaries.');
    } else if (textStart < 0 && ['Tf', 'Tj', 'TJ', "'", '"', 'Td', 'TD', 'Tm', 'T*'].includes(token)) {
      throw new Error('Cannot safely edit native appearance: text operator outside a text object.');
    }
    lastName = null;
  }
  if (textStart >= 0 || (removed === 0 && options.requireText !== false)) throw new Error('Cannot safely edit native appearance: text operators could not be isolated.');
  return output;
}

function numbers(dict: PDFDict, key: string, lib: Lib): number[] | null {
  const array = dict.lookupMaybe(lib.PDFName.of(key), lib.PDFArray);
  if (!array) return null;
  const result: number[] = [];
  for (let i = 0; i < array.size(); i += 1) {
    const value = array.lookupMaybe(i, lib.PDFNumber);
    if (!value || !Number.isFinite(value.asNumber())) return null;
    result.push(value.asNumber());
  }
  return result;
}

/** Keep the original vector border/leader/resources while replacing its text. */
export async function makeTextlessUnderlay(doc: PDFDocument, source: PDFDict, lib: Lib): Promise<TextlessUnderlay> {
  const ap = source.lookupMaybe(lib.PDFName.of('AP'), lib.PDFDict);
  const normal = ap?.lookupMaybe(lib.PDFName.of('N'), lib.PDFStream);
  if (!(normal instanceof lib.PDFRawStream)) {
    throw new Error('Cannot safely edit native appearance: unsupported normal appearance.');
  }
  const bbox = numbers(normal.dict, 'BBox', lib);
  const matrix = numbers(normal.dict, 'Matrix', lib) ?? [1, 0, 0, 1, 0, 0];
  if (!bbox || bbox.length !== 4 || matrix.length !== 6) {
    throw new Error('Cannot safely edit native appearance: invalid form geometry.');
  }
  const marker = normal.dict.get(lib.PDFName.of('PDFHubTextUnderlay'));
  const expectedHash = normal.dict.lookupMaybe(lib.PDFName.of('PDFHubAppearanceSHA256'), lib.PDFString)?.decodeText();
  if (marker instanceof lib.PDFRef && expectedHash) {
    const resources = normal.dict.lookupMaybe(lib.PDFName.of('Resources'), lib.PDFDict);
    const objects = resources?.lookupMaybe(lib.PDFName.of('XObject'), lib.PDFDict);
    const graphicsRef = objects?.get(lib.PDFName.of('OriginalGraphics'));
    const graphics = objects?.lookupMaybe(lib.PDFName.of('OriginalGraphics'), lib.PDFStream);
    const states = resources?.lookupMaybe(lib.PDFName.of('ExtGState'), lib.PDFDict);
    const state = states?.lookupMaybe(lib.PDFName.of('GS0'), lib.PDFDict);
    const opacity = source.lookupMaybe(lib.PDFName.of('CA'), lib.PDFNumber)?.asNumber() ?? 1;
    const sameOpacity = state && state.keys().every((key) => ['Type', 'ca', 'CA'].includes(key.decodeText()))
      && state.lookupMaybe(lib.PDFName.of('ca'), lib.PDFNumber)?.asNumber() === opacity
      && state.lookupMaybe(lib.PDFName.of('CA'), lib.PDFNumber)?.asNumber() === opacity;
    const sourceRect = numbers(source, 'Rect', lib);
    const expectedBbox = sourceRect?.length === 4
      ? [0, 0, sourceRect[2] - sourceRect[0], sourceRect[3] - sourceRect[1]] : null;
    const sameValues = (left: number[], right: number[]) => left.length === right.length
      && left.every((value, index) => Math.abs(value - right[index]) < 1e-6);
    const sameGeometry = expectedBbox && sameValues(bbox, expectedBbox) && sameValues(matrix, [1, 0, 0, 1, 0, 0]);
    const decoded = lib.decodePDFRawStream(normal).decode();
    if (decoded.length <= 10_000_000 && graphicsRef?.toString() === marker.toString()
      && graphics instanceof lib.PDFRawStream && sameOpacity && sameGeometry
      && await computeFileHash(Uint8Array.from(decoded)) === expectedHash) {
      assertTextlessForm(graphics, lib, 0);
      const graphicsBbox = numbers(graphics.dict, 'BBox', lib);
      const graphicsMatrix = numbers(graphics.dict, 'Matrix', lib) ?? [1, 0, 0, 1, 0, 0];
      if (!graphicsBbox || graphicsBbox.length !== 4 || graphicsMatrix.length !== 6) {
        throw new Error('Cannot safely edit native appearance: invalid saved graphics geometry.');
      }
      return { ref: marker, bbox: graphicsBbox, matrix: graphicsMatrix };
    }
  }
  return { ref: makeTextlessForm(doc, normal, lib, 0), bbox, matrix };
}

function makeTextlessForm(doc: PDFDocument, normal: PDFRawStream, lib: Lib, depth: number): PDFRef {
  if (depth > 8) throw new Error('Cannot safely edit native appearance: nested forms are too deep.');
  const decoded = lib.decodePDFRawStream(normal).decode();
  if (decoded.length > 10_000_000) throw new Error('Cannot safely edit native appearance: form is too large.');
  const resources = normal.dict.lookupMaybe(lib.PDFName.of('Resources'), lib.PDFDict);
  const xobjects = resources?.lookupMaybe(lib.PDFName.of('XObject'), lib.PDFDict);
  const wrapperRef = normal.dict.get(lib.PDFName.of('PDFHubWrappedOriginal'));
  let contents: Uint8Array;
  let replacementResources: PDFDict | undefined;
  let replacementRef: PDFRef | undefined;
  if (wrapperRef) {
    const text = new TextDecoder('latin1').decode(decoded).trim();
    const number = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
    const pattern = new RegExp(`^q\\s+${number}\\s+0\\s+0\\s+${number}\\s+${number}\\s+${number}\\s+cm\\s+/OriginalAppearance\\s+Do\\s+Q$`);
    const originalRef = xobjects?.get(lib.PDFName.of('OriginalAppearance'));
    const original = xobjects?.lookupMaybe(lib.PDFName.of('OriginalAppearance'), lib.PDFStream);
    if (!pattern.test(text) || !originalRef || originalRef.toString() !== wrapperRef.toString()
      || !(original instanceof lib.PDFRawStream) || resources?.keys().length !== 1 || xobjects?.keys().length !== 1) {
      throw new Error('Cannot safely edit native appearance: copied appearance wrapper changed.');
    }
    const cleanChild = makeTextlessForm(doc, original, lib, depth + 1);
    replacementRef = cleanChild;
    replacementResources = doc.context.obj({ XObject: { OriginalAppearance: cleanChild } }) as PDFDict;
    contents = decoded;
  } else {
    const graphics = xobjects?.lookupMaybe(lib.PDFName.of('OriginalGraphics'), lib.PDFStream);
    if (graphics) {
      if (!(graphics instanceof lib.PDFRawStream)) throw new Error('Cannot safely edit native appearance: unsupported saved graphics.');
      assertTextlessForm(graphics, lib, depth + 1);
    }
    contents = stripPdfTextObjects(decoded, { allowedXObjects: graphics ? new Set(['OriginalGraphics']) : undefined });
  }
  const stream = doc.context.flateStream(contents, {});
  for (const key of normal.dict.keys()) {
    if (['Length', 'Filter', 'DecodeParms', 'PDFHubWrappedOriginal', 'PDFHubTextUnderlay', 'PDFHubAppearanceSHA256'].includes(key.decodeText())) continue;
    if (replacementResources && key.decodeText() === 'Resources') continue;
    const value = normal.dict.get(key);
    if (value) stream.dict.set(key, value);
  }
  if (replacementResources) stream.dict.set(lib.PDFName.of('Resources'), replacementResources);
  if (replacementRef) stream.dict.set(lib.PDFName.of('PDFHubWrappedOriginal'), replacementRef);
  return doc.context.register(stream);
}

function assertTextlessForm(normal: PDFRawStream, lib: Lib, depth: number): void {
  if (depth > 8) throw new Error('Cannot safely edit native appearance: nested forms are too deep.');
  const bytes = lib.decodePDFRawStream(normal).decode();
  if (bytes.length > 10_000_000) throw new Error('Cannot safely edit native appearance: saved graphics are too large.');
  const marker = normal.dict.get(lib.PDFName.of('PDFHubWrappedOriginal'));
  if (!marker) {
    const resources = normal.dict.lookupMaybe(lib.PDFName.of('Resources'), lib.PDFDict);
    const objects = resources?.lookupMaybe(lib.PDFName.of('XObject'), lib.PDFDict);
    const graphics = objects?.lookupMaybe(lib.PDFName.of('OriginalGraphics'), lib.PDFStream);
    if (graphics) {
      if (!(graphics instanceof lib.PDFRawStream)) throw new Error('Cannot safely edit native appearance: unsupported saved graphics.');
      assertTextlessForm(graphics, lib, depth + 1);
    }
    stripPdfTextObjects(bytes, { requireText: false, forbidText: true, allowedXObjects: graphics ? new Set(['OriginalGraphics']) : undefined });
    return;
  }
  const resources = normal.dict.lookupMaybe(lib.PDFName.of('Resources'), lib.PDFDict);
  const objects = resources?.lookupMaybe(lib.PDFName.of('XObject'), lib.PDFDict);
  const ref = objects?.get(lib.PDFName.of('OriginalAppearance'));
  const child = objects?.lookupMaybe(lib.PDFName.of('OriginalAppearance'), lib.PDFStream);
  const text = new TextDecoder('latin1').decode(bytes).trim();
  const number = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
  const pattern = new RegExp(`^q\\s+${number}\\s+0\\s+0\\s+${number}\\s+${number}\\s+${number}\\s+cm\\s+/OriginalAppearance\\s+Do\\s+Q$`);
  if (!pattern.test(text) || !ref || ref.toString() !== marker.toString() || !(child instanceof lib.PDFRawStream)
    || resources?.keys().length !== 1 || objects?.keys().length !== 1) {
    throw new Error('Cannot safely edit native appearance: copied graphics wrapper changed.');
  }
  assertTextlessForm(child, lib, depth + 1);
}
