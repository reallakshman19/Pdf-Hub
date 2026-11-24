/**
 * Incremental PDF update writer (ISO 32000-1 §7.5.6).
 *
 * pdf-lib can only rewrite a whole document. Writing an incremental update
 * instead keeps the original bytes as an exact, untouched prefix of the
 * output and appends only the objects that were added or changed, followed
 * by a cross-reference section whose /Prev points at the original one.
 *
 * Callers capture a baseline right after `PDFDocument.load`, mutate the
 * document with ordinary pdf-lib APIs, then serialize. The baseline is null
 * when the source cannot be safely appended to (encrypted, or no parseable
 * trailing cross-reference); callers must then fall back to a full rewrite.
 */

type PdfLibNs = typeof import('pdf-lib');
type PDFDocumentT = import('pdf-lib').PDFDocument;
type PDFObjectT = import('pdf-lib').PDFObject;
type PDFRefT = import('pdf-lib').PDFRef;

interface ObjectSnapshot {
  object: PDFObjectT;
  /** Serialized dictionary (streams) or whole object (everything else). */
  signature: Uint8Array;
  /** Raw stream payload identity; streams are compared by reference, not by bytes. */
  streamContents?: Uint8Array;
}

interface OriginalXref {
  kind: 'table' | 'stream';
  offset: number;
  size: number;
}

export interface IncrementalPdfBaseline {
  readonly originalBytes: Uint8Array;
  readonly xref: OriginalXref;
  readonly objects: ReadonlyMap<string, ObjectSnapshot>;
}

export interface IncrementalPdfUpdateResult {
  bytes: Uint8Array;
  /** Number of new or modified indirect objects written after the original bytes. */
  writtenObjectCount: number;
}

const MAX_OFFSET = 0xffffffff;

function latin1(bytes: Uint8Array): string {
  let out = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    out += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return out;
}

function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) out[index] = text.charCodeAt(index) & 0xff;
  return out;
}

function serialize(object: PDFObjectT): Uint8Array {
  const buffer = new Uint8Array(object.sizeInBytes());
  object.copyBytesInto(buffer, 0);
  return buffer;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function refKey(ref: PDFRefT): string {
  return `${ref.objectNumber} ${ref.generationNumber}`;
}

/** Locates the last `startxref` and classifies the section it points at. */
export function readOriginalXref(bytes: Uint8Array): OriginalXref | null {
  const tail = latin1(bytes.subarray(Math.max(0, bytes.length - 4096)));
  const match = /startxref\s+(\d+)\s*%%EOF\s*$/.exec(tail)
    ?? /startxref\s+(\d+)\s*%%EOF[\s\S]*$/.exec(tail);
  if (!match) return null;
  const offset = Number(match[1]);
  if (!Number.isSafeInteger(offset) || offset <= 0 || offset >= bytes.length) return null;

  const window = latin1(bytes.subarray(offset, Math.min(bytes.length, offset + 65536)));
  if (window.startsWith('xref')) {
    const trailerAt = window.indexOf('trailer');
    if (trailerAt < 0) return null;
    const size = /\/Size\s+(\d+)/.exec(window.slice(trailerAt));
    return size ? { kind: 'table', offset, size: Number(size[1]) } : null;
  }
  if (/^\s*\d+\s+\d+\s+obj\b/.test(window)) {
    const dictEnd = window.indexOf('stream');
    const head = dictEnd > 0 ? window.slice(0, dictEnd) : window;
    if (!/\/Type\s*\/XRef\b/.test(head)) return null;
    const size = /\/Size\s+(\d+)/.exec(head);
    return size ? { kind: 'stream', offset, size: Number(size[1]) } : null;
  }
  return null;
}

/**
 * Snapshot the freshly loaded document. Must run before any mutation.
 * Returns null when an incremental update is not safe for this source.
 */
export function captureIncrementalPdfBaseline(
  doc: PDFDocumentT,
  lib: PdfLibNs,
  originalBytes: Uint8Array,
): IncrementalPdfBaseline | null {
  const { context } = doc;
  if (context.trailerInfo.Encrypt || !(context.trailerInfo.Root instanceof lib.PDFRef)) return null;
  if (originalBytes.length > MAX_OFFSET) return null;
  const xref = readOriginalXref(originalBytes);
  if (!xref || !Number.isSafeInteger(xref.size) || xref.size <= 0) return null;

  // New objects must not reuse a number the original xref already assigns,
  // including objects pdf-lib could not parse.
  context.largestObjectNumber = Math.max(context.largestObjectNumber, xref.size - 1);

  const objects = new Map<string, ObjectSnapshot>();
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (object instanceof lib.PDFStream) {
      objects.set(refKey(ref), {
        object,
        signature: serialize(object.dict),
        streamContents: object instanceof lib.PDFRawStream ? object.contents : undefined,
      });
    } else {
      objects.set(refKey(ref), { object, signature: serialize(object) });
    }
  }
  return { originalBytes, xref, objects };
}

function changedSinceBaseline(
  object: PDFObjectT,
  snapshot: ObjectSnapshot | undefined,
  lib: PdfLibNs,
): boolean {
  if (!snapshot || snapshot.object !== object) return true;
  if (object instanceof lib.PDFStream) {
    if (object instanceof lib.PDFRawStream && object.contents !== snapshot.streamContents) return true;
    if (!(object instanceof lib.PDFRawStream)) return true;
    return !sameBytes(serialize(object.dict), snapshot.signature);
  }
  return !sameBytes(serialize(object), snapshot.signature);
}

function subsections(numbers: readonly number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const number of numbers) {
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === number) last[1] += 1;
    else runs.push([number, 1]);
  }
  return runs;
}

/**
 * Flushes pending pdf-lib embeds, then appends every new or modified object
 * and a cross-reference section to the original bytes.
 */
export async function serializeIncrementalPdfUpdate(
  doc: PDFDocumentT,
  lib: PdfLibNs,
  baseline: IncrementalPdfBaseline,
): Promise<IncrementalPdfUpdateResult> {
  await doc.flush();
  const { context } = doc;
  const original = baseline.originalBytes;

  const changed = context.enumerateIndirectObjects()
    .filter(([ref, object]) => changedSinceBaseline(object, baseline.objects.get(refKey(ref)), lib))
    .sort(([a], [b]) => a.objectNumber - b.objectNumber);

  const parts: Uint8Array[] = [];
  let cursor = original.length;
  const push = (part: Uint8Array) => {
    parts.push(part);
    cursor += part.length;
  };

  // The original may not end in an EOL; never glue our first token onto %%EOF.
  push(asciiBytes('\n'));

  const entries: Array<{ number: number; generation: number; offset: number }> = [];
  for (const [ref, object] of changed) {
    entries.push({ number: ref.objectNumber, generation: ref.generationNumber, offset: cursor });
    push(asciiBytes(`${ref.objectNumber} ${ref.generationNumber} obj\n`));
    push(serialize(object));
    push(asciiBytes('\nendobj\n'));
  }

  const trailer = context.trailerInfo;
  const trailerRefs = [
    `/Root ${(trailer.Root as PDFRefT).toString()}`,
    trailer.Info ? `/Info ${trailer.Info.toString()}` : '',
    trailer.ID ? `/ID ${latin1(serialize(trailer.ID))}` : '',
    `/Prev ${baseline.xref.offset}`,
  ].filter(Boolean).join(' ');

  let xrefOffset: number;
  if (baseline.xref.kind === 'table') {
    xrefOffset = cursor;
    const size = Math.max(baseline.xref.size, context.largestObjectNumber + 1);
    let table = 'xref\n';
    const byNumber = new Map(entries.map((entry) => [entry.number, entry]));
    for (const [start, count] of subsections(entries.map((entry) => entry.number))) {
      table += `${start} ${count}\n`;
      for (let number = start; number < start + count; number += 1) {
        const entry = byNumber.get(number)!;
        table += `${String(entry.offset).padStart(10, '0')} ${String(entry.generation).padStart(5, '0')} n\r\n`;
      }
    }
    table += `trailer\n<< /Size ${size} ${trailerRefs} >>\n`;
    push(asciiBytes(table));
  } else {
    // A cross-reference stream for originals that use one (PDF 1.5+).
    const xrefNumber = context.largestObjectNumber + 1;
    context.largestObjectNumber = xrefNumber;
    xrefOffset = cursor;
    const all = [...entries, { number: xrefNumber, generation: 0, offset: xrefOffset }];
    const size = Math.max(baseline.xref.size, xrefNumber + 1);
    const data = new Uint8Array(all.length * 7);
    all.forEach((entry, index) => {
      const at = index * 7;
      data[at] = 1;
      data[at + 1] = (entry.offset >>> 24) & 0xff;
      data[at + 2] = (entry.offset >>> 16) & 0xff;
      data[at + 3] = (entry.offset >>> 8) & 0xff;
      data[at + 4] = entry.offset & 0xff;
      data[at + 5] = (entry.generation >>> 8) & 0xff;
      data[at + 6] = entry.generation & 0xff;
    });
    const index = subsections(all.map((entry) => entry.number)).flat().join(' ');
    push(asciiBytes(
      `${xrefNumber} 0 obj\n<< /Type /XRef /Size ${size} /W [1 4 2] /Index [${index}] ${trailerRefs} /Length ${data.length} >>\nstream\n`,
    ));
    push(data);
    push(asciiBytes('\nendstream\nendobj\n'));
  }
  push(asciiBytes(`startxref\n${xrefOffset}\n%%EOF\n`));

  if (cursor > MAX_OFFSET) {
    throw new Error('Incremental PDF update exceeds the 4 GiB cross-reference offset limit.');
  }

  const bytes = new Uint8Array(cursor);
  bytes.set(original, 0);
  let at = original.length;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return { bytes, writtenObjectCount: changed.length };
}
