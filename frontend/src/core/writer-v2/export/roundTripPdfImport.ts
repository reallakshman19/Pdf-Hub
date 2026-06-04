import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import {
  importPdfHubWriterProject,
  type ImportPdfHubProjectResult,
} from './projectZip';

/**
 * Detect and extract the editable Writer project ZIP that
 * {@link exportRoundTripWriterPdf} embeds as a PDF file attachment.
 *
 * Returns `null` when the PDF carries no PDF Hub editable layer (i.e. it is a
 * plain or externally-flattened PDF), so callers can fall back gracefully.
 */
export async function extractWriterProjectFromPdf(
  pdfBytes: Uint8Array,
): Promise<ImportPdfHubProjectResult | null> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false });
  } catch {
    return null;
  }

  const zipBytes = findEmbeddedProjectZip(doc);
  if (!zipBytes) return null;

  try {
    return await importPdfHubWriterProject(zipBytes);
  } catch {
    // Embedded data exists but is not a valid PDF Hub project — treat as absent.
    return null;
  }
}

function findEmbeddedProjectZip(doc: PDFDocument): Uint8Array | null {
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  if (!names) return null;

  const embeddedFiles = names.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  if (!embeddedFiles) return null;

  const collected: Uint8Array[] = [];
  collectFromNameTree(embeddedFiles, collected, 0);

  for (const bytes of collected) {
    if (looksLikeZip(bytes)) return bytes;
  }
  return null;
}

/**
 * PDF name trees can either hold a flat `/Names` array or branch via `/Kids`.
 * Walk both, bounded by a depth guard against malformed/cyclic trees.
 */
function collectFromNameTree(
  node: PDFDict,
  out: Uint8Array[],
  depth: number,
): void {
  if (depth > 32) return;

  const namesArray = node.lookupMaybe(PDFName.of('Names'), PDFArray);
  if (namesArray) {
    // Entries alternate: name, fileSpec, name, fileSpec, ...
    for (let index = 1; index < namesArray.size(); index += 2) {
      const fileSpec = namesArray.lookupMaybe(index, PDFDict);
      const bytes = readFileSpecBytes(fileSpec);
      if (bytes) out.push(bytes);
    }
  }

  const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
  if (kids) {
    for (let index = 0; index < kids.size(); index += 1) {
      const kid = kids.lookupMaybe(index, PDFDict);
      if (kid) collectFromNameTree(kid, out, depth + 1);
    }
  }
}

function readFileSpecBytes(fileSpec: PDFDict | undefined): Uint8Array | null {
  if (!fileSpec) return null;

  const ef = fileSpec.lookupMaybe(PDFName.of('EF'), PDFDict);
  if (!ef) return null;

  const fObj = ef.lookup(PDFName.of('F'));
  const ufObj = ef.lookup(PDFName.of('UF'));
  const stream =
    (fObj instanceof PDFRawStream ? fObj : undefined) ??
    (ufObj instanceof PDFRawStream ? ufObj : undefined);
  if (!stream) return null;

  try {
    return decodePDFRawStream(stream).decode();
  } catch {
    try {
      return stream.getContents();
    } catch {
      return null;
    }
  }
}

function looksLikeZip(bytes: Uint8Array): boolean {
  // Local file header "PK\x03\x04" or empty-archive marker "PK\x05\x06".
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06)
  );
}
