/**
 * ISO 19005 (PDF/A-1b, 2b, 2u, 3b) Archival Exporter & Self-Verifying Pipeline.
 *
 * Performs genuine PDF/A remediation using `pdf-lib` + `@pdf-lib/fontkit`:
 * - Embeds missing Standard-14 fonts (OFL Liberation Sans TTF + BSD-3 Foxit PFB)
 *   with `/Length1`/`2`/`3` & `/ToUnicode` CMaps.
 * - Flattens markup appearances and normalizes surviving annotations (`/F 4`).
 * - Strips forbidden JavaScript / interactive actions / `/NeedAppearances`.
 * - Enforces attachment policy (strips for 1b/2b/2u; populates `/AF` + `/AFRelationship` for 3b).
 * - Embeds valid IEC 61966-2-1 sRGB v2.1.0 `/OutputIntents` ICC profile.
 * - Writes uncompressed XMP `/Metadata` synchronized with `/Info` and deterministic Trailer `/ID`.
 * - Disables object streams + rewrites `%PDF-1.4` header in-place for `PDF/A-1b`.
 * - Runs closed-loop `runPdfAPreflight` self-audit on final exported bytes.
 */

import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { throwIfAborted } from '@/core/cancellation/operationCancellation';
import { flattenNativePdfAnnotations } from '@/core/pdf-annotations/flattenNativePdfAnnotations';
import { computeSha256Hex } from '@/core/redaction/redactionAudit';
import { buildSrgbIccProfile } from './srgbIccProfile';
import {
  createFontRemediatorContext,
  remediateFontDictionaryInPlace,
} from './standard14Remediator';
import {
  buildPdfAXmpPacket,
  formatPdfInfoDate,
} from './xmpMetadata';
import { encodeSameRealmUtf8 } from './pfbParser';
import { runPdfAPreflight } from './pdfaPreflight';
import {
  PDFA_PROFILES,
  normalizeXmpTimestamp,
  type ExportPdfAInput,
  type ExportPdfAResult,
  type PdfAComplianceCertificate,
} from './types';

type PdfLibNs = Awaited<ReturnType<typeof pdfLib>>;
type PDFDocumentT = import('pdf-lib').PDFDocument;
type PDFDictT = import('pdf-lib').PDFDict;
type PDFObjectT = import('pdf-lib').PDFObject;

const FORBIDDEN_ACTION_NAMES = new Set([
  'JavaScript',
  'Launch',
  'Sound',
  'Movie',
  'RichMedia',
  'ResetForm',
  'ImportData',
  'Hide',
  'SetOCGState',
  'Trans',
  'Rendition',
  'GoTo3DView',
]);

const FORBIDDEN_ANNOT_SUBTYPES = new Set([
  'Movie',
  'Sound',
  'Screen',
  '3D',
  'RichMedia',
]);

export class PdfABlockerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PdfABlockerError';
    this.code = code;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function computeDeterministicTrailerIdPair(seed: string): Promise<[string, string]> {
  const encoded = new TextEncoder().encode(seed);
  const hashHex = await computeSha256Hex(encoded);
  const firstHalf = hashHex.slice(0, 32).toUpperCase().padEnd(32, '0');
  const secondSeed = new TextEncoder().encode(`${seed}:id2`);
  const secondHash = (await computeSha256Hex(secondSeed)).slice(0, 32).toUpperCase().padEnd(32, '0');
  return [firstHalf, secondHash];
}

function patchHeaderToPdf14(bytes: Uint8Array): Uint8Array {
  // Replaces `%PDF-1.x` (first 8 bytes) with `%PDF-1.4` keeping byte offsets identical.
  if (bytes.length < 8) return bytes;
  const headerPrefix = String.fromCharCode(...bytes.subarray(0, 5));
  if (headerPrefix !== '%PDF-') return bytes;
  const patched = new Uint8Array(bytes);
  const target = '%PDF-1.4';
  for (let i = 0; i < 8; i += 1) {
    patched[i] = target.charCodeAt(i);
  }
  return patched;
}

function isActionSafe(
  actionObj: PDFObjectT | undefined,
  lib: PdfLibNs,
  lookup: (obj: PDFObjectT | undefined) => PDFObjectT | undefined,
): boolean {
  const dict = lookup(actionObj);
  if (!(dict instanceof lib.PDFDict)) return false;
  const sName = dict.lookupMaybe(lib.PDFName.of('S'), lib.PDFName)?.decodeText() ?? '';
  if (FORBIDDEN_ACTION_NAMES.has(sName) || dict.get(lib.PDFName.of('JS'))) {
    return false;
  }
  return sName === 'URI' || sName === 'GoTo' || sName === 'GoToR';
}

function stripForbiddenActionsAndForms(
  doc: PDFDocumentT,
  lib: PdfLibNs,
  remediations: string[],
): void {
  const lookup = (obj: PDFObjectT | undefined) => doc.context.lookup(obj);
  let strippedActions = 0;

  if (doc.catalog.get(lib.PDFName.of('OpenAction'))) {
    if (!isActionSafe(doc.catalog.get(lib.PDFName.of('OpenAction')), lib, lookup)) {
      doc.catalog.delete(lib.PDFName.of('OpenAction'));
      strippedActions += 1;
    }
  }
  if (doc.catalog.get(lib.PDFName.of('AA'))) {
    doc.catalog.delete(lib.PDFName.of('AA'));
    strippedActions += 1;
  }

  const names = doc.catalog.lookupMaybe(lib.PDFName.of('Names'), lib.PDFDict);
  if (names?.get(lib.PDFName.of('JavaScript'))) {
    names.delete(lib.PDFName.of('JavaScript'));
    strippedActions += 1;
  }

  const acroForm = doc.catalog.lookupMaybe(lib.PDFName.of('AcroForm'), lib.PDFDict);
  if (acroForm?.get(lib.PDFName.of('NeedAppearances'))) {
    acroForm.delete(lib.PDFName.of('NeedAppearances'));
    remediations.push('Removed AcroForm /NeedAppearances for static archival rendering.');
  }
  if (acroForm?.get(lib.PDFName.of('XFA'))) {
    acroForm.delete(lib.PDFName.of('XFA'));
    remediations.push('Removed unsupported AcroForm /XFA payload.');
  }

  for (const page of doc.getPages()) {
    if (page.node.get(lib.PDFName.of('AA'))) {
      page.node.delete(lib.PDFName.of('AA'));
      strippedActions += 1;
    }
  }

  if (strippedActions > 0) {
    remediations.push(`Removed ${strippedActions} JavaScript/additional action trigger(s).`);
  }
}

function normalizePageAnnotations(
  doc: PDFDocumentT,
  lib: PdfLibNs,
  dropApLessMarkup: boolean,
  remediations: string[],
): void {
  const lookup = (obj: PDFObjectT | undefined) => doc.context.lookup(obj);
  let removedAnnots = 0;
  let fixedFlags = 0;

  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(lib.PDFName.of('Annots'), lib.PDFArray);
    if (!annots) continue;

    const keptRefs: PDFObjectT[] = [];
    for (let i = 0; i < annots.size(); i += 1) {
      const raw = annots.get(i);
      const annot = annots.lookupMaybe(i, lib.PDFDict);
      if (!annot) continue;

      const subtype = annot.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText() ?? '';
      if (FORBIDDEN_ANNOT_SUBTYPES.has(subtype)) {
        removedAnnots += 1;
        continue;
      }

      if (annot.get(lib.PDFName.of('AA'))) {
        annot.delete(lib.PDFName.of('AA'));
      }
      if (annot.get(lib.PDFName.of('A')) && !isActionSafe(annot.get(lib.PDFName.of('A')), lib, lookup)) {
        annot.delete(lib.PDFName.of('A'));
      }

      const ap = annot.lookupMaybe(lib.PDFName.of('AP'), lib.PDFDict);
      const hasAp = Boolean(ap?.get(lib.PDFName.of('N')));
      if (!hasAp && subtype !== 'Link' && subtype !== 'Popup' && dropApLessMarkup) {
        removedAnnots += 1;
        continue;
      }

      if (subtype !== 'Popup') {
        const existingF = annot.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0;
        // Clear Invisible(1), Hidden(2), NoView(32), ToggleNoView(256) and set Print(4).
        const normalizedF = (existingF & ~(1 | 2 | 32 | 256)) | 4;
        if (normalizedF !== existingF || !annot.get(lib.PDFName.of('F'))) {
          annot.set(lib.PDFName.of('F'), lib.PDFNumber.of(normalizedF));
          fixedFlags += 1;
        }
      }

      keptRefs.push(raw);
    }

    if (keptRefs.length === 0) {
      page.node.delete(lib.PDFName.of('Annots'));
    } else if (keptRefs.length !== annots.size()) {
      page.node.set(lib.PDFName.of('Annots'), doc.context.obj(keptRefs));
    }
  }

  if (removedAnnots > 0) {
    remediations.push(`Removed ${removedAnnots} non-archival or appearance-less annotation(s).`);
  }
  if (fixedFlags > 0) {
    remediations.push(`Normalized Print flag (/F) on ${fixedFlags} annotation(s).`);
  }
}

async function remediateAllFonts(
  doc: PDFDocumentT,
  lib: PdfLibNs,
  options: ExportPdfAInput['options'],
  remediations: string[],
): Promise<void> {
  const ctx = await createFontRemediatorContext(doc, lib);
  const visitedFonts = new Set<string>();
  const visitedForms = new Set<string>();
  const lookup = (obj: PDFObjectT | undefined) => doc.context.lookup(obj);
  const ensureToUnicode = PDFA_PROFILES[options.targetConformance].requiresToUnicode;

  const processResources = async (resources: PDFDictT) => {
    const fontsDict = resources.lookupMaybe(lib.PDFName.of('Font'), lib.PDFDict);
    if (fontsDict) {
      for (const key of fontsDict.keys()) {
        const raw = fontsDict.get(key);
        const fontDict = fontsDict.lookupMaybe(key, lib.PDFDict);
        if (!fontDict) continue;
        const visitKey = raw instanceof lib.PDFRef ? raw.tag : `inline-${visitedFonts.size}`;
        if (visitedFonts.has(visitKey)) continue;
        visitedFonts.add(visitKey);

        const summary = await remediateFontDictionaryInPlace(fontDict, ctx, {
          embedStandard14Fonts: options.embedStandard14Fonts,
          substituteExternalUnembeddedFonts: options.substituteExternalUnembeddedFonts,
          ensureToUnicode,
        });
        if (summary) {
          remediations.push(summary);
        }
      }
    }

    const xobjects = resources.lookupMaybe(lib.PDFName.of('XObject'), lib.PDFDict);
    if (xobjects) {
      for (const key of xobjects.keys()) {
        const raw = xobjects.get(key);
        const formKey = raw instanceof lib.PDFRef ? raw.tag : `form-${visitedForms.size}`;
        if (visitedForms.has(formKey)) continue;
        visitedForms.add(formKey);
        const xobj = lookup(raw);
        if (xobj instanceof lib.PDFStream) {
          const subtype = xobj.dict.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText();
          if (subtype === 'Form') {
            const nestedRes = xobj.dict.lookupMaybe(lib.PDFName.of('Resources'), lib.PDFDict);
            if (nestedRes) {
              await processResources(nestedRes);
            }
          }
        }
      }
    }
  };

  for (const page of doc.getPages()) {
    const res = page.node.Resources();
    if (res) {
      await processResources(res);
    }
  }
}

function handleEmbeddedFilesPolicy(
  doc: PDFDocumentT,
  lib: PdfLibNs,
  targetConformance: ExportPdfAInput['options']['targetConformance'],
  stripNonCompliant: boolean,
  remediations: string[],
): void {
  const names = doc.catalog.lookupMaybe(lib.PDFName.of('Names'), lib.PDFDict);
  const embeddedFiles = names?.lookupMaybe(lib.PDFName.of('EmbeddedFiles'), lib.PDFDict);

  if (targetConformance !== 'PDFA_3B') {
    if (stripNonCompliant && (embeddedFiles || doc.catalog.get(lib.PDFName.of('AF')))) {
      names?.delete(lib.PDFName.of('EmbeddedFiles'));
      doc.catalog.delete(lib.PDFName.of('AF'));
      remediations.push(`Stripped embedded file attachments (disallowed in ${PDFA_PROFILES[targetConformance].shortLabel}).`);
    }
    return;
  }

  if (!embeddedFiles) return;

  // For PDF/A-3b: ensure Catalog /AF links all Filespec entries with AFRelationship & Subtype
  const collectedSpecRefs: PDFObjectT[] = [];
  const walkNode = (node: PDFDictT, visited = new Set<string>()) => {
    const arr = node.lookupMaybe(lib.PDFName.of('Names'), lib.PDFArray);
    if (arr) {
      for (let i = 0; i + 1 < arr.size(); i += 2) {
        const rawSpec = arr.get(i + 1);
        const specDict = arr.lookupMaybe(i + 1, lib.PDFDict);
        if (!specDict) continue;
        if (!specDict.get(lib.PDFName.of('AFRelationship'))) {
          specDict.set(lib.PDFName.of('AFRelationship'), lib.PDFName.of('Data'));
        }
        const ef = specDict.lookupMaybe(lib.PDFName.of('EF'), lib.PDFDict);
        const fStream = ef?.lookup(lib.PDFName.of('F'));
        if (fStream instanceof lib.PDFStream && !fStream.dict.get(lib.PDFName.of('Subtype'))) {
          fStream.dict.set(lib.PDFName.of('Subtype'), lib.PDFName.of('application/octet-stream'));
        }
        if (rawSpec instanceof lib.PDFRef) {
          collectedSpecRefs.push(rawSpec);
        } else {
          const registeredSpecRef = doc.context.register(specDict);
          arr.set(i + 1, registeredSpecRef);
          collectedSpecRefs.push(registeredSpecRef);
        }
      }
    }
    const kids = node.lookupMaybe(lib.PDFName.of('Kids'), lib.PDFArray);
    if (kids) {
      for (let i = 0; i < kids.size(); i += 1) {
        const raw = kids.get(i);
        const tag = raw instanceof lib.PDFRef ? raw.tag : `k-${i}`;
        if (visited.has(tag)) continue;
        visited.add(tag);
        const k = kids.lookupMaybe(i, lib.PDFDict);
        if (k) walkNode(k, visited);
      }
    }
  };
  walkNode(embeddedFiles);

  if (collectedSpecRefs.length > 0) {
    doc.catalog.set(lib.PDFName.of('AF'), doc.context.obj(collectedSpecRefs));
    remediations.push(`Registered ${collectedSpecRefs.length} attachment(s) in PDF/A-3b /AF catalog array.`);
  }
}

function attachSrgbOutputIntent(
  doc: PDFDocumentT,
  lib: PdfLibNs,
  remediations: string[],
): void {
  const iccBytes = buildSrgbIccProfile();
  const iccStream = doc.context.flateStream(iccBytes, {
    N: 3,
    Alternate: 'DeviceRGB',
  });
  const iccRef = doc.context.register(iccStream);

  const intentDict = doc.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: lib.PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: lib.PDFString.of('http://www.color.org'),
    Info: lib.PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccRef,
  });
  const intentRef = doc.context.register(intentDict);
  doc.catalog.set(lib.PDFName.of('OutputIntents'), doc.context.obj([intentRef]));
  remediations.push('Embedded IEC 61966-2-1 sRGB ICC v2.1.0 OutputIntent (/S /GTS_PDFA1).');
}

function synchronizeInfoAndXmp(
  doc: PDFDocumentT,
  lib: PdfLibNs,
  conformance: ExportPdfAInput['options']['targetConformance'],
  metadata: ExportPdfAInput['options']['metadata'],
  remediations: string[],
): void {
  const normalizedMeta = {
    ...metadata,
    createDateIso: normalizeXmpTimestamp(metadata.createDateIso),
    modifyDateIso: normalizeXmpTimestamp(metadata.modifyDateIso),
  };

  doc.setTitle(normalizedMeta.title, { showInWindowTitleBar: true });
  if (normalizedMeta.author) {
    doc.setAuthor(normalizedMeta.author);
  }
  if (normalizedMeta.subject) {
    doc.setSubject(normalizedMeta.subject);
  }
  if (normalizedMeta.keywords) {
    doc.setKeywords([normalizedMeta.keywords]);
  }
  doc.setCreator(normalizedMeta.creatorTool);
  doc.setProducer(normalizedMeta.producer);

  // Access Info dict directly to synchronize exact UTC timestamps and purge stale mismatching keys
  const infoRef = doc.context.trailerInfo.Info;
  const infoObj = infoRef ? doc.context.lookup(infoRef) : undefined;
  if (infoObj instanceof lib.PDFDict) {
    if (!normalizedMeta.author) infoObj.delete(lib.PDFName.of('Author'));
    if (!normalizedMeta.subject) infoObj.delete(lib.PDFName.of('Subject'));
    if (!normalizedMeta.keywords) infoObj.delete(lib.PDFName.of('Keywords'));
    infoObj.delete(lib.PDFName.of('Trapped'));
    infoObj.set(lib.PDFName.of('CreationDate'), lib.PDFString.of(formatPdfInfoDate(normalizedMeta.createDateIso)));
    infoObj.set(lib.PDFName.of('ModDate'), lib.PDFString.of(formatPdfInfoDate(normalizedMeta.modifyDateIso)));
  }

  if (normalizedMeta.language.trim().length > 0) {
    doc.catalog.set(lib.PDFName.of('Lang'), lib.PDFString.of(normalizedMeta.language.trim()));
  }

  // Only keep /MarkInfo when an actual /StructTreeRoot exists
  if (!doc.catalog.get(lib.PDFName.of('StructTreeRoot')) && doc.catalog.get(lib.PDFName.of('MarkInfo'))) {
    doc.catalog.delete(lib.PDFName.of('MarkInfo'));
  }

  const xmpBytes = buildPdfAXmpPacket(conformance, normalizedMeta);
  const xmpStream = doc.context.stream(xmpBytes, {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  const xmpRef = doc.context.register(xmpStream);
  doc.catalog.set(lib.PDFName.of('Metadata'), xmpRef);

  remediations.push(`Synchronized XMP packet (pdfaid:${PDFA_PROFILES[conformance].part}${PDFA_PROFILES[conformance].conformance}) with Document Info.`);
}

/**
 * Exports an archival PDF/A file cleanly, returning both the PDF binary bytes
 * and a self-verified `PdfAComplianceCertificate` produced by re-auditing the
 * final output with `runPdfAPreflight()`.
 */
export async function exportPdfA(
  input: ExportPdfAInput,
  executionOptions?: { signal?: AbortSignal },
): Promise<ExportPdfAResult> {
  throwIfAborted(executionOptions?.signal, 'start PDF/A archival export');
  if (!input.pdfBytes || input.pdfBytes.length === 0) {
    throw new PdfABlockerError('EMPTY_INPUT', 'Cannot export an empty PDF buffer to PDF/A.');
  }

  const { options } = input;
  const profile = PDFA_PROFILES[options.targetConformance];
  const lib = await pdfLib();

  // Preliminary inspection before mutation to fail closed on hard blockers
  const initialPreflight = await runPdfAPreflight(input.pdfBytes, options.targetConformance, {
    signal: executionOptions?.signal,
    fileName: input.fileName,
  });

  if (initialPreflight.isEncrypted) {
    throw new PdfABlockerError(
      'PDFA_ENCRYPTED_FORBIDDEN',
      'Encrypted PDFs cannot be exported to PDF/A without first removing encryption.',
    );
  }

  if (!profile.supportsTransparency && initialPreflight.hasTransparency) {
    throw new PdfABlockerError(
      'PDFA_1B_TRANSPARENCY_FORBIDDEN',
      `Transparency detected on page(s) ${initialPreflight.transparencyPages.join(', ')}, which is forbidden in PDF/A-1b. Choose PDF/A-2b or flatten transparency first.`,
    );
  }

  const unembeddedExternal = initialPreflight.fonts.filter(
    (f) => f.classification === 'unembedded-external',
  );
  if (unembeddedExternal.length > 0 && !options.substituteExternalUnembeddedFonts) {
    throw new PdfABlockerError(
      'PDFA_UNEMBEDDED_EXTERNAL_FONTS',
      `Unembedded external font(s) (${unembeddedExternal.map((f) => f.baseFont).join(', ')}) cannot be preserved without fallback font substitution enabled.`,
    );
  }

  const unembeddedStd14 = initialPreflight.fonts.filter(
    (f) => f.classification === 'unembedded-standard14-remediable',
  );
  if (unembeddedStd14.length > 0 && !options.embedStandard14Fonts) {
    throw new PdfABlockerError(
      'PDFA_UNEMBEDDED_STANDARD14_FONTS',
      `Unembedded Standard-14 font(s) (${unembeddedStd14.map((f) => f.baseFont).join(', ')}) violate PDF/A; enable Standard-14 font embedding.`,
    );
  }

  const remediationsApplied: string[] = [];
  const sourceSha256 = await computeSha256Hex(input.pdfBytes);

  let workingBytes = new Uint8Array(input.pdfBytes);
  if (options.flattenAnnotations) {
    const beforeAnnots = initialPreflight.annotationIssuesCount;
    const flattened = await flattenNativePdfAnnotations(workingBytes);
    workingBytes = new Uint8Array(flattened);
    if (beforeAnnots > 0 || flattened.length !== input.pdfBytes.length) {
      remediationsApplied.push('Flattened native annotation appearances into page content streams.');
    }
  }

  throwIfAborted(executionOptions?.signal, 'load archival PDFDocument');
  const doc = await lib.PDFDocument.load(workingBytes, {
    throwOnInvalidObject: false,
    updateMetadata: false,
  });

  if (options.stripUnsafeActionsAndJs) {
    stripForbiddenActionsAndForms(doc, lib, remediationsApplied);
  }

  normalizePageAnnotations(doc, lib, options.flattenAnnotations, remediationsApplied);

  await remediateAllFonts(doc, lib, options, remediationsApplied);

  if (
    options.targetConformance === 'PDFA_3B' &&
    options.attachAuditCertificateInPdfA3b
  ) {
    const manifestPayload = encodeSameRealmUtf8(
      JSON.stringify(
        {
          schemaVersion: 1,
          targetConformance: options.targetConformance,
          sourceSha256,
          metadata: options.metadata,
          generatedAt: normalizeXmpTimestamp(new Date()),
        },
        null,
        2,
      ),
    );
    const now = new Date();
    await doc.attach(manifestPayload, 'pdfhub-archival-summary.json', {
      mimeType: 'application/json',
      description: 'PDF Hub archival metadata and source digest summary',
      creationDate: now,
      modificationDate: now,
      afRelationship: lib.AFRelationship.Supplement,
    });
    await doc.flush();
    remediationsApplied.push('Attached archival audit summary JSON for PDF/A-3b.');
  }

  handleEmbeddedFilesPolicy(
    doc,
    lib,
    options.targetConformance,
    options.stripNonCompliantAttachments,
    remediationsApplied,
  );

  attachSrgbOutputIntent(doc, lib, remediationsApplied);

  synchronizeInfoAndXmp(
    doc,
    lib,
    options.targetConformance,
    options.metadata,
    remediationsApplied,
  );

  // Set deterministic trailer /ID array (2 byte strings required by ISO 19005)
  const [id1, id2] = await computeDeterministicTrailerIdPair(
    `${sourceSha256}:${options.targetConformance}:${options.metadata.modifyDateIso}`,
  );
  doc.context.trailerInfo.ID = doc.context.obj([
    lib.PDFHexString.of(id1),
    lib.PDFHexString.of(id2),
  ]);
  remediationsApplied.push(`Assigned deterministic two-part trailer /ID (${id1.slice(0, 8)}...).`);

  throwIfAborted(executionOptions?.signal, 'serialize archival PDF');

  const rawSaved = await doc.save({
    useObjectStreams: profile.supportsObjectStreams,
  });
  const finalBytes =
    options.targetConformance === 'PDFA_1B'
      ? patchHeaderToPdf14(rawSaved)
      : new Uint8Array(rawSaved);

  if (options.targetConformance === 'PDFA_1B') {
    remediationsApplied.push('Formatted header as %PDF-1.4 with classic uncompressed xref table.');
  }

  const exportedSha256 = await computeSha256Hex(finalBytes);
  const postExportReport = await runPdfAPreflight(finalBytes, options.targetConformance, {
    signal: executionOptions?.signal,
    fileName: input.fileName,
  });

  const remainingBlockers = postExportReport.checks.filter((c) => c.severity === 'blocker');
  const remainingWarnings = postExportReport.checks.filter(
    (c) => c.severity === 'warning' && c.id !== 'PDFA-SIG',
  );
  const passed = remainingBlockers.length === 0 && remainingWarnings.length === 0;

  const certificate: PdfAComplianceCertificate = {
    schemaVersion: 1,
    generator: 'PDF Hub PDF/A Compliance Pipeline',
    generatedAt: normalizeXmpTimestamp(new Date()),
    targetConformance: options.targetConformance,
    isoStandard: profile.isoStandard,
    passed,
    sourceSha256,
    exportedSha256,
    pageCount: postExportReport.pageCount,
    metadata: postExportReport.metadata,
    remediationsApplied,
    remainingBlockers,
    remainingWarnings,
    fontAudit: postExportReport.fonts,
  };

  return {
    bytes: finalBytes,
    certificate,
    postExportReport,
    pageCount: postExportReport.pageCount,
  };
}

export { bytesToHex };
