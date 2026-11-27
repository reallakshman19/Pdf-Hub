/**
 * ISO 19005 (PDF/A-1b, 2b, 2u, 3b) Preflight Scanner & Validator.
 *
 * Audits PDF header, trailer /ID, encryption, object streams, Catalog XMP
 * metadata + /Info parity, ICC /OutputIntents, page & XObject font embedding +
 * /ToUnicode coverage, transparency (/ExtGState / SMask / Form groups),
 * interactive actions / JavaScript, annotation /AP & Print flags, attachments
 * (/EmbeddedFiles / /AF), and applied digital signature rewrite risk.
 *
 * Zero DOM dependencies — runs cleanly in Web Workers, browsers, and Vitest.
 */

import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { throwIfAborted } from '@/core/cancellation/operationCancellation';
import { inspectPdfSignatureRisk } from '@/core/pdf-signatures/signatureRisk';
import { inspectIccProfileHeader } from './srgbIccProfile';
import {
  extractFontDescriptorObject,
  resolveStandard14Spec,
} from './standard14Remediator';
import {
  parsePdfAXmpSummary,
  parsePdfInfoDateToIso,
} from './xmpMetadata';
import {
  PDFA_PROFILES,
  createDefaultPdfAMetadata,
  type PdfAArchivalMetadata,
  type PdfAAttachmentEntry,
  type PdfACheckItem,
  type PdfAConformanceLevel,
  type PdfAFontAuditEntry,
  type PdfAPreflightReport,
} from './types';

type PdfLibNs = Awaited<ReturnType<typeof pdfLib>>;
type PDFDocumentT = import('pdf-lib').PDFDocument;
type PDFDictT = import('pdf-lib').PDFDict;
type PDFObjectT = import('pdf-lib').PDFObject;

const LATIN1_DECODER = new TextDecoder('latin1');
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: false });

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

function inspectRawHeaderAndStructure(bytes: Uint8Array): {
  pdfHeaderVersion: string;
  hasBinaryHeaderComment: boolean;
  usesObjectStreams: boolean;
  hasRawTrailerId: boolean;
} {
  const head = LATIN1_DECODER.decode(bytes.subarray(0, Math.min(bytes.length, 64)));
  const verMatch = /^%PDF-(\d+\.\d+)/.exec(head);
  const pdfHeaderVersion = verMatch ? verMatch[1] : 'unknown';

  // ISO 32000-1 / ISO 19005: comment line containing >= 4 bytes >= 0x80 immediately after header line
  let hasBinaryHeaderComment = false;
  const firstNewline = bytes.indexOf(0x0a);
  const altCr = bytes.indexOf(0x0d);
  const headerEnd =
    firstNewline >= 0 && altCr >= 0
      ? Math.min(firstNewline, altCr)
      : Math.max(firstNewline, altCr);
  if (headerEnd > 0 && headerEnd + 2 < bytes.length) {
    const start =
      bytes[headerEnd] === 0x0d && bytes[headerEnd + 1] === 0x0a
        ? headerEnd + 2
        : headerEnd + 1;
    let highBytes = 0;
    for (let i = start; i < Math.min(bytes.length, start + 32); i += 1) {
      if (bytes[i] === 0x0a || bytes[i] === 0x0d) break;
      if (bytes[i] >= 0x80) highBytes += 1;
    }
    hasBinaryHeaderComment = highBytes >= 4;
  }

  // Scan tail for trailer /ID and detect object streams across PDF bytes cleanly.
  const fullLatin1 = LATIN1_DECODER.decode(bytes);
  const usesObjectStreams =
    /\/Type\s*\/ObjStm\b/.test(fullLatin1) || /\/Type\s*\/XRef\b/.test(fullLatin1);
  const tail = LATIN1_DECODER.decode(bytes.subarray(Math.max(0, bytes.length - 4096)));
  const hasRawTrailerId = /\/ID\s*\[/.test(tail);

  return {
    pdfHeaderVersion,
    hasBinaryHeaderComment,
    usesObjectStreams,
    hasRawTrailerId,
  };
}

function readPdfStringValue(
  dict: PDFDictT,
  key: string,
  lib: PdfLibNs,
): string | null {
  const obj = dict.lookup(lib.PDFName.of(key));
  if (obj instanceof lib.PDFString || obj instanceof lib.PDFHexString) {
    return obj.decodeText();
  }
  return null;
}

function scanResourceDictionaryColorSpaces(
  resources: PDFDictT,
  lib: PdfLibNs,
): { rgb: boolean; gray: boolean; cmyk: boolean } {
  let rgb = false;
  let gray = false;
  let cmyk = false;
  const colorSpaceDict = resources.lookupMaybe(lib.PDFName.of('ColorSpace'), lib.PDFDict);
  if (colorSpaceDict) {
    const serialized = colorSpaceDict.toString();
    if (serialized.includes('/DeviceRGB')) rgb = true;
    if (serialized.includes('/DeviceGray')) gray = true;
    if (serialized.includes('/DeviceCMYK')) cmyk = true;
  }
  return { rgb, gray, cmyk };
}

function scanStreamForDeviceColors(
  stream: import('pdf-lib').PDFRawStream,
  lib: PdfLibNs,
): { rgb: boolean; gray: boolean; cmyk: boolean } {
  try {
    const decoded = LATIN1_DECODER.decode(lib.decodePDFRawStream(stream).decode());
    return {
      rgb: /\brg\b|\bRG\b|\/DeviceRGB\b/.test(decoded),
      gray: /\bg\b|\bG\b|\/DeviceGray\b/.test(decoded),
      cmyk: /\bk\b|\bK\b|\/DeviceCMYK\b/.test(decoded),
    };
  } catch {
    return { rgb: false, gray: false, cmyk: false };
  }
}

function checkTransparencyInResources(
  resources: PDFDictT,
  lib: PdfLibNs,
  lookup: (obj: PDFObjectT | undefined) => PDFObjectT | undefined,
  visitedXObjects: Set<string>,
): boolean {
  const extGState = resources.lookupMaybe(lib.PDFName.of('ExtGState'), lib.PDFDict);
  if (extGState) {
    for (const key of extGState.keys()) {
      const gs = extGState.lookupMaybe(key, lib.PDFDict);
      if (!gs) continue;
      const caLower = gs.lookupMaybe(lib.PDFName.of('ca'), lib.PDFNumber)?.asNumber();
      const caUpper = gs.lookupMaybe(lib.PDFName.of('CA'), lib.PDFNumber)?.asNumber();
      if ((caLower !== undefined && caLower < 1) || (caUpper !== undefined && caUpper < 1)) {
        return true;
      }
      const smask = lookup(gs.get(lib.PDFName.of('SMask')));
      if (smask && !(smask instanceof lib.PDFName && smask.decodeText() === 'None')) {
        return true;
      }
      const bm = lookup(gs.get(lib.PDFName.of('BM')));
      if (bm instanceof lib.PDFName) {
        const bmName = bm.decodeText();
        if (bmName !== 'Normal' && bmName !== 'Compatible') {
          return true;
        }
      } else if (bm instanceof lib.PDFArray) {
        return true;
      }
    }
  }

  const xobjects = resources.lookupMaybe(lib.PDFName.of('XObject'), lib.PDFDict);
  if (xobjects) {
    for (const key of xobjects.keys()) {
      const rawRef = xobjects.get(key);
      const refTag = rawRef instanceof lib.PDFRef ? rawRef.tag : `${key.decodeText()}-${visitedXObjects.size}`;
      if (visitedXObjects.has(refTag)) continue;
      visitedXObjects.add(refTag);

      const xobj = lookup(rawRef);
      if (!(xobj instanceof lib.PDFStream)) continue;
      const subtype = xobj.dict.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText();
      if (subtype === 'Image') {
        if (xobj.dict.get(lib.PDFName.of('SMask')) || xobj.dict.get(lib.PDFName.of('Matte'))) {
          return true;
        }
      } else if (subtype === 'Form') {
        const group = xobj.dict.lookupMaybe(lib.PDFName.of('Group'), lib.PDFDict);
        const groupSubtype = group?.lookupMaybe(lib.PDFName.of('S'), lib.PDFName)?.decodeText();
        if (groupSubtype === 'Transparency') {
          return true;
        }
        const nestedRes = xobj.dict.lookupMaybe(lib.PDFName.of('Resources'), lib.PDFDict);
        if (nestedRes && checkTransparencyInResources(nestedRes, lib, lookup, visitedXObjects)) {
          return true;
        }
      }
    }
  }

  return false;
}

function actionHasForbiddenTrigger(
  actionObj: PDFObjectT | undefined,
  lib: PdfLibNs,
  lookup: (obj: PDFObjectT | undefined) => PDFObjectT | undefined,
  visited = new Set<string>(),
): boolean {
  const dict = lookup(actionObj);
  if (!(dict instanceof lib.PDFDict)) return false;

  const refTag = actionObj instanceof lib.PDFRef ? actionObj.tag : `${visited.size}`;
  if (visited.has(refTag)) return false;
  visited.add(refTag);

  const sName = dict.lookupMaybe(lib.PDFName.of('S'), lib.PDFName)?.decodeText();
  if (sName && FORBIDDEN_ACTION_NAMES.has(sName)) {
    return true;
  }
  if (dict.get(lib.PDFName.of('JS'))) {
    return true;
  }

  const next = lookup(dict.get(lib.PDFName.of('Next')));
  if (next instanceof lib.PDFDict && actionHasForbiddenTrigger(next, lib, lookup, visited)) {
    return true;
  }
  if (next instanceof lib.PDFArray) {
    for (let i = 0; i < next.size(); i += 1) {
      if (actionHasForbiddenTrigger(next.get(i), lib, lookup, visited)) {
        return true;
      }
    }
  }
  return false;
}

function collectAttachments(
  doc: PDFDocumentT,
  lib: PdfLibNs,
): PdfAAttachmentEntry[] {
  const entries: PdfAAttachmentEntry[] = [];
  const afRefs = new Set<string>();
  const afArray = doc.catalog.lookupMaybe(lib.PDFName.of('AF'), lib.PDFArray);
  if (afArray) {
    for (let i = 0; i < afArray.size(); i += 1) {
      const raw = afArray.get(i);
      if (raw instanceof lib.PDFRef) {
        afRefs.add(raw.tag);
      }
    }
  }

  const names = doc.catalog.lookupMaybe(lib.PDFName.of('Names'), lib.PDFDict);
  const embeddedFiles = names?.lookupMaybe(lib.PDFName.of('EmbeddedFiles'), lib.PDFDict);
  if (!embeddedFiles) return entries;

  const walkTree = (node: PDFDictT, visited = new Set<string>()) => {
    const namesArr = node.lookupMaybe(lib.PDFName.of('Names'), lib.PDFArray);
    if (namesArr) {
      for (let i = 0; i + 1 < namesArr.size(); i += 2) {
        const keyObj = namesArr.lookup(i);
        const name =
          keyObj instanceof lib.PDFString || keyObj instanceof lib.PDFHexString
            ? keyObj.decodeText()
            : `attachment-${entries.length + 1}`;
        const rawSpec = namesArr.get(i + 1);
        const specDict = namesArr.lookupMaybe(i + 1, lib.PDFDict);
        const ef = specDict?.lookupMaybe(lib.PDFName.of('EF'), lib.PDFDict);
        const fStream = ef?.lookup(lib.PDFName.of('F'));
        const mimeType =
          fStream instanceof lib.PDFStream
            ? fStream.dict.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText() ?? null
            : null;
        const afRel =
          specDict?.lookupMaybe(lib.PDFName.of('AFRelationship'), lib.PDFName)?.decodeText() ??
          null;
        const inCatalogAf = rawSpec instanceof lib.PDFRef && afRefs.has(rawSpec.tag);

        entries.push({
          name,
          mimeType,
          hasAfRelationship: Boolean(afRel && (afArray ? inCatalogAf || afRefs.size === 0 : false)),
          afRelationship: afRel,
        });
      }
    }
    const kids = node.lookupMaybe(lib.PDFName.of('Kids'), lib.PDFArray);
    if (kids) {
      for (let i = 0; i < kids.size(); i += 1) {
        const raw = kids.get(i);
        const tag = raw instanceof lib.PDFRef ? raw.tag : `kid-${i}`;
        if (visited.has(tag)) continue;
        visited.add(tag);
        const kidDict = kids.lookupMaybe(i, lib.PDFDict);
        if (kidDict) walkTree(kidDict, visited);
      }
    }
  };

  walkTree(embeddedFiles);
  return entries;
}

/**
 * Audits a PDF byte buffer against the requested ISO 19005 PDF/A conformance level.
 */
export async function runPdfAPreflight(
  bytes: Uint8Array,
  targetConformance: PdfAConformanceLevel = 'PDFA_2B',
  options?: { signal?: AbortSignal; fileName?: string },
): Promise<PdfAPreflightReport> {
  throwIfAborted(options?.signal, 'run PDF/A preflight');

  const profile = PDFA_PROFILES[targetConformance];
  const rawMeta = inspectRawHeaderAndStructure(bytes);
  const lib = await pdfLib();

  let doc: PDFDocumentT;
  try {
    doc = await lib.PDFDocument.load(bytes, {
      throwOnInvalidObject: false,
      updateMetadata: false,
      ignoreEncryption: true,
    });
  } catch (err) {
    const fallbackMeta = createDefaultPdfAMetadata(options?.fileName);
    return {
      targetConformance,
      pageCount: 0,
      pdfHeaderVersion: rawMeta.pdfHeaderVersion,
      hasBinaryHeaderComment: rawMeta.hasBinaryHeaderComment,
      hasTrailerId: false,
      usesObjectStreams: rawMeta.usesObjectStreams,
      isEncrypted: false,
      hasJavaScriptOrActions: false,
      hasTransparency: false,
      transparencyPages: [],
      usesDeviceRgb: false,
      usesDeviceGray: false,
      usesDeviceCmyk: false,
      hasOutputIntent: false,
      outputIntentSummary: null,
      outputIntentComponentCount: null,
      hasXmpMetadata: false,
      xmpCompressed: false,
      declaredPdfAPart: null,
      declaredPdfAConformance: null,
      infoXmpSynchronized: false,
      attachments: [],
      fonts: [],
      annotationIssuesCount: 0,
      hasNeedAppearances: false,
      signatureStatus: 'UNKNOWN',
      signatureCount: 0,
      metadata: fallbackMeta,
      checks: [
        {
          id: 'PDFA-PARSE',
          category: 'structure',
          severity: 'blocker',
          autoFixable: false,
          title: 'PDF structure unreadable',
          detail: err instanceof Error ? err.message : 'Unable to parse PDF structure for compliance audit.',
        },
      ],
      readyWithoutRemediation: false,
      canExportWithRemediation: false,
    };
  }

  throwIfAborted(options?.signal, 'inspect PDF/A structures');

  const isEncrypted = doc.isEncrypted || Boolean(doc.context.trailerInfo.Encrypt);
  const lookup = (obj: PDFObjectT | undefined) => doc.context.lookup(obj);
  const hasTrailerId =
    doc.context.trailerInfo.ID instanceof lib.PDFArray
      ? doc.context.trailerInfo.ID.size() === 2
      : rawMeta.hasRawTrailerId;

  // Read Info dictionary & XMP metadata
  const infoRef = doc.context.trailerInfo.Info;
  const infoDict = infoRef ? lookup(infoRef) : undefined;
  const infoPdfDict = infoDict instanceof lib.PDFDict ? infoDict : undefined;

  const metadataRef = doc.catalog.get(lib.PDFName.of('Metadata'));
  const metadataObj = lookup(metadataRef);
  let xmpSummary = parsePdfAXmpSummary('');
  let xmpCompressed = false;
  if (metadataObj instanceof lib.PDFStream) {
    xmpCompressed = Boolean(metadataObj.dict.get(lib.PDFName.of('Filter')));
    try {
      const xmlBytes =
        metadataObj instanceof lib.PDFRawStream
          ? lib.decodePDFRawStream(metadataObj).decode()
          : metadataObj.getContents();
      xmpSummary = parsePdfAXmpSummary(UTF8_DECODER.decode(xmlBytes));
    } catch {
      xmpSummary = parsePdfAXmpSummary('');
    }
  }

  const infoTitle = doc.getTitle() ?? null;
  const infoAuthor = doc.getAuthor() ?? null;
  const infoSubject = doc.getSubject() ?? null;
  const infoKeywords = doc.getKeywords() ?? null;
  const infoCreator = doc.getCreator() ?? null;
  const infoProducer = doc.getProducer() ?? null;
  const infoCreateIso = parsePdfInfoDateToIso(
    infoPdfDict ? readPdfStringValue(infoPdfDict, 'CreationDate', lib) : null,
  );
  const infoModIso = parsePdfInfoDateToIso(
    infoPdfDict ? readPdfStringValue(infoPdfDict, 'ModDate', lib) : null,
  );
  const catalogLang = readPdfStringValue(doc.catalog, 'Lang', lib) ?? '';

  const metadata: PdfAArchivalMetadata = createDefaultPdfAMetadata(options?.fileName, {
    title: infoTitle ?? xmpSummary.title ?? undefined,
    author: infoAuthor ?? xmpSummary.author ?? '',
    subject: infoSubject ?? xmpSummary.subject ?? '',
    keywords: infoKeywords ?? xmpSummary.keywords ?? '',
    creatorTool: infoCreator ?? xmpSummary.creatorTool ?? undefined,
    producer: infoProducer ?? xmpSummary.producer ?? undefined,
    language: catalogLang || 'en-US',
    createDateIso: infoCreateIso ?? xmpSummary.createDateIso ?? undefined,
    modifyDateIso: infoModIso ?? xmpSummary.modifyDateIso ?? undefined,
  });

  const infoXmpSynchronized =
    xmpSummary.hasXmpPacket &&
    (infoTitle ?? '') === (xmpSummary.title ?? '') &&
    (infoAuthor ?? '') === (xmpSummary.author ?? '') &&
    (infoSubject ?? '') === (xmpSummary.subject ?? '') &&
    (infoCreator ?? '') === (xmpSummary.creatorTool ?? '') &&
    (infoProducer ?? '') === (xmpSummary.producer ?? '') &&
    (!infoCreateIso || infoCreateIso === xmpSummary.createDateIso) &&
    (!infoModIso || infoModIso === xmpSummary.modifyDateIso);

  // Inspect OutputIntents
  let hasOutputIntent = false;
  let outputIntentSummary: string | null = null;
  let outputIntentComponentCount: number | null = null;
  const outputIntents = doc.catalog.lookupMaybe(lib.PDFName.of('OutputIntents'), lib.PDFArray);
  if (outputIntents && outputIntents.size() > 0) {
    for (let i = 0; i < outputIntents.size(); i += 1) {
      const intent = outputIntents.lookupMaybe(i, lib.PDFDict);
      if (!intent) continue;
      const sName = intent.lookupMaybe(lib.PDFName.of('S'), lib.PDFName)?.decodeText();
      if (sName !== 'GTS_PDFA1') continue;
      const profileStream = intent.lookup(lib.PDFName.of('DestOutputProfile'));
      if (profileStream instanceof lib.PDFStream) {
        try {
          const iccBytes =
            profileStream instanceof lib.PDFRawStream
              ? lib.decodePDFRawStream(profileStream).decode()
              : profileStream.getContents();
          const iccInfo = inspectIccProfileHeader(iccBytes);
          if (iccInfo.valid) {
            hasOutputIntent = true;
            outputIntentComponentCount = iccInfo.componentCount;
            outputIntentSummary =
              readPdfStringValue(intent, 'OutputConditionIdentifier', lib) ??
              iccInfo.colorSpace.trim();
            break;
          }
        } catch {
          // Invalid ICC stream counts as missing OutputIntent
        }
      }
    }
  }

  // Inspect Catalog & Pages for fonts, transparency, colors, annotations, and actions
  const fontMap = new Map<string, PdfAFontAuditEntry>();
  const transparencyPages: number[] = [];
  let usesDeviceRgb = false;
  let usesDeviceGray = false;
  let usesDeviceCmyk = false;
  let annotationIssuesCount = 0;
  let hasJavaScriptOrActions =
    actionHasForbiddenTrigger(doc.catalog.get(lib.PDFName.of('OpenAction')), lib, lookup) ||
    Boolean(doc.catalog.lookupMaybe(lib.PDFName.of('Names'), lib.PDFDict)?.get(lib.PDFName.of('JavaScript')));

  const catalogAA = doc.catalog.lookupMaybe(lib.PDFName.of('AA'), lib.PDFDict);
  if (catalogAA) {
    for (const key of catalogAA.keys()) {
      if (actionHasForbiddenTrigger(catalogAA.get(key), lib, lookup)) {
        hasJavaScriptOrActions = true;
      }
    }
  }

  const collectFontsFromResources = (
    resources: PDFDictT,
    pageNum: number,
    visitedFontRefs: Set<string>,
    visitedFormRefs: Set<string>,
  ) => {
    const fontsDict = resources.lookupMaybe(lib.PDFName.of('Font'), lib.PDFDict);
    if (fontsDict) {
      for (const key of fontsDict.keys()) {
        const rawRef = fontsDict.get(key);
        const fontDict = fontsDict.lookupMaybe(key, lib.PDFDict);
        if (!fontDict) continue;
        const mapKey =
          rawRef instanceof lib.PDFRef
            ? rawRef.tag
            : `inline:${pageNum}:${key.decodeText()}`;
        const existing = fontMap.get(mapKey);
        if (existing) {
          if (!existing.pages.includes(pageNum)) {
            existing.pages.push(pageNum);
          }
          continue;
        }
        if (visitedFontRefs.has(mapKey)) continue;
        visitedFontRefs.add(mapKey);

        const extracted = extractFontDescriptorObject(fontDict, lib, lookup);
        const stdSpec = resolveStandard14Spec(extracted.baseFont);
        const classification: PdfAFontAuditEntry['classification'] =
          extracted.subtype === 'Type3'
            ? 'type3'
            : extracted.embedded
            ? extracted.hasToUnicode
              ? 'embedded-with-tounicode'
              : 'embedded-missing-tounicode'
            : stdSpec
            ? 'unembedded-standard14-remediable'
            : 'unembedded-external';

        fontMap.set(mapKey, {
          resourceName: key.decodeText(),
          baseFont: extracted.baseFont,
          subtype: extracted.subtype,
          classification,
          pages: [pageNum],
          embedded: extracted.embedded,
          hasToUnicode: extracted.hasToUnicode,
          mappedStandard14: stdSpec?.canonicalName ?? null,
        });
      }
    }

    const xobjects = resources.lookupMaybe(lib.PDFName.of('XObject'), lib.PDFDict);
    if (xobjects) {
      for (const key of xobjects.keys()) {
        const rawRef = xobjects.get(key);
        const tag = rawRef instanceof lib.PDFRef ? rawRef.tag : `xobj-${key.decodeText()}`;
        if (visitedFormRefs.has(tag)) continue;
        visitedFormRefs.add(tag);
        const xobj = lookup(rawRef);
        if (!(xobj instanceof lib.PDFStream)) continue;
        const subtype = xobj.dict.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText();
        if (subtype === 'Form') {
          const nestedRes = xobj.dict.lookupMaybe(lib.PDFName.of('Resources'), lib.PDFDict);
          if (nestedRes) {
            collectFontsFromResources(nestedRes, pageNum, visitedFontRefs, visitedFormRefs);
          }
          if (xobj instanceof lib.PDFRawStream) {
            const colors = scanStreamForDeviceColors(xobj, lib);
            usesDeviceRgb = usesDeviceRgb || colors.rgb;
            usesDeviceGray = usesDeviceGray || colors.gray;
            usesDeviceCmyk = usesDeviceCmyk || colors.cmyk;
          }
        }
      }
    }
  };

  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i += 1) {
    throwIfAborted(options?.signal, `inspect PDF/A page ${i + 1}`);
    const pageNum = i + 1;
    const page = pages[i];
    const pageDict = page.node;

    const resources = pageDict.Resources();
    if (resources) {
      collectFontsFromResources(resources, pageNum, new Set(), new Set());
      const resColors = scanResourceDictionaryColorSpaces(resources, lib);
      usesDeviceRgb = usesDeviceRgb || resColors.rgb;
      usesDeviceGray = usesDeviceGray || resColors.gray;
      usesDeviceCmyk = usesDeviceCmyk || resColors.cmyk;

      if (checkTransparencyInResources(resources, lib, lookup, new Set())) {
        transparencyPages.push(pageNum);
      }
    }

    const contentsRaw = lookup(pageDict.get(lib.PDFName.of('Contents')));
    const contentStreams: import('pdf-lib').PDFRawStream[] = [];
    if (contentsRaw instanceof lib.PDFRawStream) {
      contentStreams.push(contentsRaw);
    } else if (contentsRaw instanceof lib.PDFArray) {
      for (let c = 0; c < contentsRaw.size(); c += 1) {
        const entry = contentsRaw.lookup(c);
        if (entry instanceof lib.PDFRawStream) {
          contentStreams.push(entry);
        }
      }
    }
    for (const cs of contentStreams) {
      const colors = scanStreamForDeviceColors(cs, lib);
      usesDeviceRgb = usesDeviceRgb || colors.rgb;
      usesDeviceGray = usesDeviceGray || colors.gray;
      usesDeviceCmyk = usesDeviceCmyk || colors.cmyk;
    }

    const pageAA = pageDict.lookupMaybe(lib.PDFName.of('AA'), lib.PDFDict);
    if (pageAA) {
      for (const k of pageAA.keys()) {
        if (actionHasForbiddenTrigger(pageAA.get(k), lib, lookup)) {
          hasJavaScriptOrActions = true;
        }
      }
    }

    const annots = pageDict.lookupMaybe(lib.PDFName.of('Annots'), lib.PDFArray);
    if (annots) {
      for (let a = 0; a < annots.size(); a += 1) {
        const annot = annots.lookupMaybe(a, lib.PDFDict);
        if (!annot) continue;
        const subtype = annot.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText() ?? '';
        if (FORBIDDEN_ANNOT_SUBTYPES.has(subtype)) {
          annotationIssuesCount += 1;
        }
        const ap = annot.lookupMaybe(lib.PDFName.of('AP'), lib.PDFDict);
        if (!ap?.get(lib.PDFName.of('N')) && subtype !== 'Link' && subtype !== 'Popup') {
          annotationIssuesCount += 1;
        }
        const fVal = annot.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0;
        const hasPrint = (fVal & 4) === 4;
        const hasForbiddenFlags = (fVal & (1 | 2 | 32 | 256)) !== 0;
        if (subtype !== 'Popup' && (!hasPrint || hasForbiddenFlags)) {
          annotationIssuesCount += 1;
        }
        if (actionHasForbiddenTrigger(annot.get(lib.PDFName.of('A')), lib, lookup)) {
          hasJavaScriptOrActions = true;
        }
        const annotAA = annot.lookupMaybe(lib.PDFName.of('AA'), lib.PDFDict);
        if (annotAA) {
          for (const k of annotAA.keys()) {
            if (actionHasForbiddenTrigger(annotAA.get(k), lib, lookup)) {
              hasJavaScriptOrActions = true;
            }
          }
        }
      }
    }
  }

  const acroForm = doc.catalog.lookupMaybe(lib.PDFName.of('AcroForm'), lib.PDFDict);
  const hasNeedAppearances =
    acroForm?.lookupMaybe(lib.PDFName.of('NeedAppearances'), lib.PDFBool)?.asBoolean() === true;

  const attachments = collectAttachments(doc, lib);
  const fonts = Array.from(fontMap.values());
  const hasTransparency = transparencyPages.length > 0;
  const signatureRisk = await inspectPdfSignatureRisk(bytes);

  // Build compliance checks matching targetConformance
  const checks: PdfACheckItem[] = [];

  checks.push({
    id: 'PDFA-ENC',
    category: 'encryption',
    severity: isEncrypted ? 'blocker' : 'pass',
    autoFixable: false,
    title: 'Unencrypted Document',
    detail: isEncrypted
      ? 'Document contains /Encrypt dictionary. ISO 19005 forbids encrypted archival PDFs.'
      : 'Document is unencrypted.',
  });

  const versionOk =
    targetConformance === 'PDFA_1B'
      ? /^1\.[0-4]$/.test(rawMeta.pdfHeaderVersion)
      : /^1\.[0-7]$/.test(rawMeta.pdfHeaderVersion);
  checks.push({
    id: 'PDFA-HEADER',
    category: 'structure',
    severity: versionOk && rawMeta.hasBinaryHeaderComment ? 'pass' : 'warning',
    autoFixable: true,
    title: `PDF Header (%PDF-${profile.pdfVersionLabel} + Binary Marker)`,
    detail:
      versionOk && rawMeta.hasBinaryHeaderComment
        ? `Header %PDF-${rawMeta.pdfHeaderVersion} with binary marker bytes is compliant.`
        : `Current header (%PDF-${rawMeta.pdfHeaderVersion}) will be normalized to %PDF-${profile.pdfVersionLabel} with binary comment bytes on export.`,
  });

  checks.push({
    id: 'PDFA-TRAILER-ID',
    category: 'structure',
    severity: hasTrailerId ? 'pass' : 'warning',
    autoFixable: true,
    title: 'Trailer File Identifier (/ID)',
    detail: hasTrailerId
      ? 'Document trailer defines a two-part /ID array.'
      : 'Trailer /ID is missing; a deterministic SHA-256 /ID pair will be generated on archival export.',
  });

  if (targetConformance === 'PDFA_1B') {
    checks.push({
      id: 'PDFA-OBJSTM',
      category: 'structure',
      severity: rawMeta.usesObjectStreams ? 'warning' : 'pass',
      autoFixable: true,
      title: 'Classic Cross-Reference Table (No Object Streams)',
      detail: rawMeta.usesObjectStreams
        ? 'Document uses compressed object/XRef streams, forbidden in PDF/A-1b. Archival export disables object streams automatically.'
        : 'Uses uncompressed classic xref table compatible with PDF/A-1b.',
    });
  }

  const xmpMatchesTarget =
    xmpSummary.hasXmpPacket &&
    xmpSummary.pdfaPart === profile.part &&
    xmpSummary.pdfaConformance === profile.conformance &&
    !(targetConformance === 'PDFA_1B' && xmpCompressed) &&
    infoXmpSynchronized;
  checks.push({
    id: 'PDFA-XMP',
    category: 'xmp-metadata',
    severity: xmpMatchesTarget ? 'pass' : 'warning',
    autoFixable: true,
    title: `XMP Identification (${profile.shortLabel}) & /Info Sync`,
    detail: xmpMatchesTarget
      ? `Uncompressed XMP declares pdfaid:part=${profile.part} (${profile.conformance}) in sync with /Info.`
      : 'Catalog /Metadata XMP packet will be written/synchronized with /Info fields and pdfaid identification.',
  });

  checks.push({
    id: 'PDFA-COLOR',
    category: 'color-intent',
    severity: hasOutputIntent ? 'pass' : 'warning',
    autoFixable: true,
    title: 'Embedded ICC OutputIntent',
    detail: hasOutputIntent
      ? `Valid GTS_PDFA1 OutputIntent found (${outputIntentSummary ?? 'ICC Profile'}).`
      : 'No valid GTS_PDFA1 OutputIntent found; an IEC 61966-2-1 sRGB ICC v2.1.0 profile will be embedded.',
  });

  if (usesDeviceCmyk && !hasOutputIntent) {
    checks.push({
      id: 'PDFA-CMYK-WARN',
      category: 'color-intent',
      severity: 'warning',
      autoFixable: true,
      title: 'DeviceCMYK Content Detected',
      detail:
        'Pages reference DeviceCMYK color operators; embedding an sRGB OutputIntent requires DeviceCMYK compatibility verification in strict print workflows.',
    });
  }

  const unembeddedStd14 = fonts.filter(
    (f) => f.classification === 'unembedded-standard14-remediable',
  );
  const unembeddedExternal = fonts.filter((f) => f.classification === 'unembedded-external');
  const missingToUnicode = fonts.filter(
    (f) => f.subtype !== 'Type3' && !f.hasToUnicode,
  );

  if (unembeddedExternal.length > 0) {
    checks.push({
      id: 'PDFA-FONTS-EXT',
      category: 'fonts',
      severity: 'blocker',
      autoFixable: false,
      title: `${unembeddedExternal.length} Unembedded External Font(s)`,
      detail: `Unembedded non-Standard-14 fonts (${unembeddedExternal.map((f) => f.baseFont).join(', ')}) require source embedding or explicit fallback substitution.`,
      pages: Array.from(new Set(unembeddedExternal.flatMap((f) => f.pages))).sort((a, b) => a - b),
    });
  } else if (unembeddedStd14.length > 0) {
    checks.push({
      id: 'PDFA-FONTS-STD14',
      category: 'fonts',
      severity: 'warning',
      autoFixable: true,
      title: `${unembeddedStd14.length} Standard-14 Font(s) Pending Embedding`,
      detail: `Unembedded Standard-14 fonts (${unembeddedStd14.map((f) => f.baseFont).join(', ')}) will be embedded using OFL Liberation Sans / BSD-3 Foxit metrics.`,
      pages: Array.from(new Set(unembeddedStd14.flatMap((f) => f.pages))).sort((a, b) => a - b),
    });
  } else {
    checks.push({
      id: 'PDFA-FONTS-OK',
      category: 'fonts',
      severity: 'pass',
      autoFixable: false,
      title: 'All Fonts Embedded',
      detail:
        fonts.length === 0
          ? 'Document pages contain no unembedded font dictionaries.'
          : `All ${fonts.length} document font resource(s) include embedded font programs.`,
    });
  }

  if (profile.requiresToUnicode && missingToUnicode.length > 0) {
    const nonRemediableMissing = missingToUnicode.filter(
      (f) => f.subtype === 'Type0' && f.embedded && !f.hasToUnicode,
    );
    checks.push({
      id: 'PDFA-2U-TOUNICODE',
      category: 'fonts',
      severity: nonRemediableMissing.length > 0 ? 'blocker' : 'warning',
      autoFixable: nonRemediableMissing.length === 0,
      title: `PDF/A-2u Unicode Mapping (${missingToUnicode.length} font(s) missing ToUnicode)`,
      detail:
        nonRemediableMissing.length > 0
          ? `Composite Type0 font(s) (${nonRemediableMissing.map((f) => f.baseFont).join(', ')}) lack /ToUnicode CMaps required by PDF/A-2u.`
          : 'Single-byte fonts missing /ToUnicode CMaps will receive generated ToUnicode tables on archival export.',
      pages: Array.from(new Set(missingToUnicode.flatMap((f) => f.pages))).sort((a, b) => a - b),
    });
  }

  if (!profile.supportsTransparency) {
    checks.push({
      id: 'PDFA-TRANSP',
      category: 'transparency',
      severity: hasTransparency ? 'blocker' : 'pass',
      autoFixable: false,
      title: 'Transparency Restrictions (PDF/A-1b)',
      detail: hasTransparency
        ? `Alpha opacity/SMask/Blend transparency detected on page(s) ${transparencyPages.join(', ')}. Switch to PDF/A-2b or opt into opaque page rasterization.`
        : 'No alpha transparency or soft masks detected.',
      pages: hasTransparency ? transparencyPages : undefined,
    });
  }

  checks.push({
    id: 'PDFA-ACTIONS',
    category: 'actions',
    severity: hasJavaScriptOrActions ? 'warning' : 'pass',
    autoFixable: true,
    title: 'Forbidden Actions & JavaScript',
    detail: hasJavaScriptOrActions
      ? 'Interactive scripts or triggers detected; archival export will strip JavaScript, OpenAction, and AA entries.'
      : 'No JavaScript or forbidden interactive triggers detected.',
  });

  checks.push({
    id: 'PDFA-ANNOTS',
    category: 'annotations',
    severity: annotationIssuesCount > 0 || hasNeedAppearances ? 'warning' : 'pass',
    autoFixable: true,
    title: 'Annotation Appearances & Print Flags',
    detail:
      annotationIssuesCount > 0 || hasNeedAppearances
        ? `${annotationIssuesCount} annotation issue(s)${hasNeedAppearances ? ' + AcroForm /NeedAppearances' : ''}; archival flattening & Print flag normalization will remediate.`
        : 'All annotations have compliant appearance streams and print flags.',
  });

  const nonPdfa3bWithAttachments =
    !profile.supportsAssociatedFiles && attachments.length > 0;
  const pdfa3bMissingAf =
    profile.supportsAssociatedFiles &&
    attachments.some((a) => !a.hasAfRelationship || !a.mimeType);
  checks.push({
    id: 'PDFA-ATTACH',
    category: 'attachments',
    severity: nonPdfa3bWithAttachments || pdfa3bMissingAf ? 'warning' : 'pass',
    autoFixable: true,
    title: 'Embedded Files & /AF Association',
    detail: nonPdfa3bWithAttachments
      ? `${attachments.length} attachment(s) (${attachments.map((a) => a.name).join(', ')}) are disallowed in ${profile.shortLabel} and will be stripped unless exporting PDF/A-3b.`
      : pdfa3bMissingAf
      ? 'Attachments will be linked via Catalog /AF and AFRelationship metadata for PDF/A-3b.'
      : attachments.length > 0
      ? `${attachments.length} attachment(s) carry valid PDF/A-3b /AFRelationship metadata.`
      : 'No embedded file attachments present.',
  });

  if (signatureRisk.status !== 'UNSIGNED') {
    checks.push({
      id: 'PDFA-SIG',
      category: 'signatures',
      severity: 'warning',
      autoFixable: false,
      title: 'Digital Signature Rewrite Risk',
      detail:
        signatureRisk.status === 'SIGNED'
          ? `Document has ${signatureRisk.signatureCount} signature(s); archival export rewrites bytes and invalidates signatures.`
          : 'Unable to rule out applied digital signatures; archival rewrite may invalidate signatures.',
    });
  }

  const blockers = checks.filter((c) => c.severity === 'blocker');
  const warnings = checks.filter((c) => c.severity === 'warning');
  const readyWithoutRemediation = blockers.length === 0 && warnings.length === 0;
  const canExportWithRemediation = blockers.every((b) => b.autoFixable);

  return {
    targetConformance,
    pageCount: pages.length,
    pdfHeaderVersion: rawMeta.pdfHeaderVersion,
    hasBinaryHeaderComment: rawMeta.hasBinaryHeaderComment,
    hasTrailerId,
    usesObjectStreams: rawMeta.usesObjectStreams,
    isEncrypted,
    hasJavaScriptOrActions,
    hasTransparency,
    transparencyPages,
    usesDeviceRgb,
    usesDeviceGray,
    usesDeviceCmyk,
    hasOutputIntent,
    outputIntentSummary,
    outputIntentComponentCount,
    hasXmpMetadata: xmpSummary.hasXmpPacket,
    xmpCompressed,
    declaredPdfAPart: xmpSummary.pdfaPart,
    declaredPdfAConformance: xmpSummary.pdfaConformance,
    infoXmpSynchronized,
    attachments,
    fonts,
    annotationIssuesCount,
    hasNeedAppearances,
    signatureStatus: signatureRisk.status,
    signatureCount: signatureRisk.signatureCount,
    metadata,
    checks,
    readyWithoutRemediation,
    canExportWithRemediation,
  };
}
