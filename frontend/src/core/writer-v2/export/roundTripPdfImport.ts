import JSZip from 'jszip';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { warn as logWarn } from '@/core/logger/service';
import { ROUND_TRIP_ATTACHMENT_NAME } from './roundTripPdfExport';
import {
  importPdfHubWriterProject,
  ORIGINAL_PDF_MEMBER,
  sourcePdfSha256,
  type ImportPdfHubProjectResult,
  type PdfHubWriterProjectManifestV1,
} from './projectZip';

type PdfLibNs = Awaited<ReturnType<typeof pdfLib>>;
type PDFDocumentT = import('pdf-lib').PDFDocument;
type PDFDictT = import('pdf-lib').PDFDict;

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
  const zipBytes = await extractWriterProjectZipFromPdf(pdfBytes);
  if (!zipBytes) return null;
  try { return await importPdfHubWriterProject(zipBytes); } catch { return null; }
}

/** Extract only the reserved attachment; production import then uses bounded ZIP admission. */
export async function extractWriterProjectZipFromPdf(pdfBytes: Uint8Array): Promise<Uint8Array | null> {
  const lib = await pdfLib();
  let doc: PDFDocumentT;
  try { doc = await lib.PDFDocument.load(pdfBytes, { throwOnInvalidObject: false }); } catch { return null; }
  const zip = findEmbeddedProjectZip(doc, lib);
  return zip ? restoreHostPrefixOriginal(zip, pdfBytes) : null;
}

/**
 * Incrementally-saved editable PDFs do not store original.pdf inside the
 * project: the original is the exact byte prefix of the host PDF. Rebuild a
 * self-contained project ZIP so ordinary bounded admission and SHA-256
 * verification apply unchanged. ZIPs without that declaration pass through.
 *
 * Returns null (the file then opens as an ordinary flattened PDF) when the
 * declared prefix no longer matches: another tool fully rewrote the file, so
 * the untouched source cannot be recovered without guessing.
 */
export async function restoreHostPrefixOriginal(
  zipBytes: Uint8Array,
  hostPdfBytes: Uint8Array,
): Promise<Uint8Array | null> {
  const zip = await JSZip.loadAsync(zipBytes);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) return zipBytes;
  let manifest: PdfHubWriterProjectManifestV1;
  try {
    manifest = JSON.parse(await manifestFile.async('string')) as PdfHubWriterProjectManifestV1;
  } catch {
    return zipBytes; // Malformed manifests are rejected by normal admission.
  }
  const storage = manifest.source?.originalPdfStorage;
  if (storage === undefined) return zipBytes;

  if (storage.kind !== 'host-pdf-prefix'
    || !Number.isSafeInteger(storage.byteLength)
    || storage.byteLength <= 0
    || storage.byteLength > hostPdfBytes.byteLength
    || manifest.files?.originalPdf !== ORIGINAL_PDF_MEMBER
    || !manifest.source?.originalPdfSha256) {
    throw new Error('Editable PDF declares an invalid original PDF prefix.');
  }
  if (zip.file(ORIGINAL_PDF_MEMBER)) {
    throw new Error('Editable PDF stores the original PDF twice with conflicting locations.');
  }
  const original = hostPdfBytes.subarray(0, storage.byteLength);
  if (await sourcePdfSha256(original) !== manifest.source.originalPdfSha256) {
    logWarn('writer', 'Editable PDF was rewritten after export; opening it as a flattened PDF', {
      declaredByteLength: storage.byteLength,
      hostByteLength: hostPdfBytes.byteLength,
    });
    return null;
  }
  zip.file(ORIGINAL_PDF_MEMBER, original);
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

function findEmbeddedProjectZip(doc: PDFDocumentT, lib: PdfLibNs): Uint8Array | null {
  const names = doc.catalog.lookupMaybe(lib.PDFName.of('Names'), lib.PDFDict);
  if (!names) return null;

  const embeddedFiles = names.lookupMaybe(lib.PDFName.of('EmbeddedFiles'), lib.PDFDict);
  if (!embeddedFiles) return null;

  const collected: PDFDictT[] = [];
  collectFromNameTree(embeddedFiles, collected, new Set(), 0, lib);
  if (collected.length === 0) return null;
  if (collected.length !== 1) throw new Error('Editable PDF contains ambiguous Writer attachments.');
  const bytes = readFileSpecBytes(collected[0], lib);
  if (!bytes || !looksLikeZip(bytes)) throw new Error('Editable PDF contains an invalid Writer attachment.');
  return bytes;
}

function collectFromNameTree(node: PDFDictT, out: PDFDictT[], visited: Set<PDFDictT>, depth: number, lib: PdfLibNs): void {
  if (depth > 32 || visited.has(node) || visited.size >= 4096) throw new Error('Invalid embedded file name tree.');
  visited.add(node);
  const namesArray = node.lookupMaybe(lib.PDFName.of('Names'), lib.PDFArray);
  if (namesArray) {
    if (namesArray.size() % 2 !== 0) throw new Error('Invalid embedded file name array.');
    for (let index = 0; index < namesArray.size(); index += 2) {
      const name = namesArray.lookup(index);
      if (!(name instanceof lib.PDFString || name instanceof lib.PDFHexString) || name.decodeText() !== ROUND_TRIP_ATTACHMENT_NAME) continue;
      const spec = namesArray.lookupMaybe(index + 1, lib.PDFDict);
      if (!spec) throw new Error('Invalid Writer attachment file specification.');
      out.push(spec);
    }
  }
  const kids = node.lookupMaybe(lib.PDFName.of('Kids'), lib.PDFArray);
  if (kids) for (let index = 0; index < kids.size(); index += 1) {
    const kid = kids.lookupMaybe(index, lib.PDFDict);
    if (kid) collectFromNameTree(kid, out, visited, depth + 1, lib);
  }
}

function readFileSpecBytes(fileSpec: PDFDictT | undefined, lib: PdfLibNs): Uint8Array | null {
  if (!fileSpec) return null;

  const ef = fileSpec.lookupMaybe(lib.PDFName.of('EF'), lib.PDFDict);
  if (!ef) return null;

  const fObj = ef.lookup(lib.PDFName.of('F'));
  const ufObj = ef.lookup(lib.PDFName.of('UF'));
  const stream =
    (fObj instanceof lib.PDFRawStream ? fObj : undefined) ??
    (ufObj instanceof lib.PDFRawStream ? ufObj : undefined);
  if (!stream) return null;

  try {
    return lib.decodePDFRawStream(stream).decode();
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
