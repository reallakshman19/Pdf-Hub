import { zlibSync } from 'fflate';
import { log } from '../logger/service';
import { pdfLib } from '../pdf/lazyPdfLib';
import type { CadExtrudedMesh3D } from './types';
import type {
  Pdf3DActivationSettings,
  Pdf3DAnnotationRecord,
  Pdf3DEmbedOptions,
  Pdf3DExtractResult,
  Pdf3DStreamFormat,
  Pdf3DViewPreset,
} from './pdf3dTypes';
import { U3D_MAGIC_FILE_HEADER, parseU3DBinary, serializeMeshesToU3DBinary } from './u3dCodec';
import { inspectPrcBinary } from './prcInspector';
import { computeMeshMetrics } from './meshGeometryUtils';

type PdfLibModule = Awaited<ReturnType<typeof pdfLib>>;
type LoadedPdfDoc = Awaited<ReturnType<PdfLibModule['PDFDocument']['load']>>;
type PdfArrayLike = PdfLibModule['PDFArray']['prototype'];
type PdfBoolLike = PdfLibModule['PDFBool']['prototype'];
type PdfDictLike = PdfLibModule['PDFDict']['prototype'];
type PdfNumberLike = PdfLibModule['PDFNumber']['prototype'];
type PdfStreamLike = PdfLibModule['PDFStream']['prototype'];

function createHelpers(lib: PdfLibModule) {
  const {
    PDFArray,
    PDFBool,
    PDFDict,
    PDFName,
    PDFNumber,
    PDFRawStream,
    PDFRef,
    PDFString,
    decodePDFRawStream,
  } = lib;

  const pdfNameToString = (val: unknown): string | null =>
    val instanceof PDFName ? val.decodeText() : null;

  const pdfTextToString = (val: unknown): string | null => {
    if (val instanceof PDFString) return val.decodeText();
    if (val instanceof PDFName) return val.decodeText();
    return null;
  };

  const resolveRef = <T>(doc: LoadedPdfDoc, val: unknown): T | undefined =>
    val instanceof PDFRef ? (doc.context.lookup(val) as T | undefined) : (val as T | undefined);

  const readRect = (
    doc: LoadedPdfDoc,
    annot: PdfDictLike,
  ): [number, number, number, number] => {
    const rectObj = resolveRef<PdfArrayLike>(doc, annot.get(PDFName.of('Rect')));
    if (!(rectObj instanceof PDFArray) || rectObj.size() < 4) {
      return [0, 0, 0, 0];
    }
    const nums: number[] = [];
    for (let i = 0; i < 4; i++) {
      const item = resolveRef<PdfNumberLike>(doc, rectObj.get(i));
      nums.push(item instanceof PDFNumber ? item.asNumber() : 0);
    }
    return [nums[0], nums[1], nums[2], nums[3]];
  };

  const parseNumberArray = (doc: LoadedPdfDoc, arrVal: unknown): number[] | undefined => {
    const arr = resolveRef<PdfArrayLike>(doc, arrVal);
    if (!(arr instanceof PDFArray)) return undefined;
    const out: number[] = [];
    for (let i = 0; i < arr.size(); i++) {
      const item = resolveRef<PdfNumberLike>(doc, arr.get(i));
      if (item instanceof PDFNumber) out.push(item.asNumber());
    }
    return out;
  };

  const parseViewDict = (
    doc: LoadedPdfDoc,
    viewVal: unknown,
    fallbackName: string,
  ): Pdf3DViewPreset | null => {
    const dict = resolveRef<PdfDictLike>(doc, viewVal);
    if (!(dict instanceof PDFDict)) return null;

    const name =
      pdfTextToString(dict.get(PDFName.of('IN'))) ??
      pdfTextToString(dict.get(PDFName.of('XN'))) ??
      fallbackName;
    const c2w = parseNumberArray(doc, dict.get(PDFName.of('C2W')));
    const coObj = resolveRef<PdfNumberLike>(doc, dict.get(PDFName.of('CO')));
    const centerOfOrbit = coObj instanceof PDFNumber ? coObj.asNumber() : undefined;

    let projectionType: 'perspective' | 'orthographic' | undefined;
    let fovDeg: number | undefined;
    let orthoScale: number | undefined;
    const projDict = resolveRef<PdfDictLike>(doc, dict.get(PDFName.of('P')));
    if (projDict instanceof PDFDict) {
      const subtype = pdfNameToString(projDict.get(PDFName.of('Subtype')));
      if (subtype === 'P') {
        projectionType = 'perspective';
        const fov = resolveRef<PdfNumberLike>(doc, projDict.get(PDFName.of('FOV')));
        if (fov instanceof PDFNumber) fovDeg = fov.asNumber();
      } else if (subtype === 'O') {
        projectionType = 'orthographic';
        const os = resolveRef<PdfNumberLike>(doc, projDict.get(PDFName.of('OS')));
        if (os instanceof PDFNumber) orthoScale = os.asNumber();
      }
    }

    let backgroundColor: [number, number, number] | undefined;
    const bgDict = resolveRef<PdfDictLike>(doc, dict.get(PDFName.of('BG')));
    if (bgDict instanceof PDFDict) {
      const col = parseNumberArray(doc, bgDict.get(PDFName.of('C')));
      if (col && col.length >= 3) {
        backgroundColor = [col[0], col[1], col[2]];
      }
    }

    let lightingScheme: string | undefined;
    const lsDict = resolveRef<PdfDictLike>(doc, dict.get(PDFName.of('LS')));
    if (lsDict instanceof PDFDict) {
      lightingScheme = pdfNameToString(lsDict.get(PDFName.of('Subtype'))) ?? undefined;
    }

    return {
      name,
      cameraToWorld: c2w,
      centerOfOrbit,
      projectionType,
      fovDeg,
      orthoScale,
      backgroundColor,
      lightingScheme,
    };
  };

  const parseActivationDict = (doc: LoadedPdfDoc, actVal: unknown): Pdf3DActivationSettings => {
    const dict = resolveRef<PdfDictLike>(doc, actVal);
    if (!(dict instanceof PDFDict)) {
      return {
        toolbarEnabled: true,
        navigationEnabled: true,
      };
    }
    const tbObj = resolveRef<PdfBoolLike>(doc, dict.get(PDFName.of('TB')));
    const npObj = resolveRef<PdfBoolLike>(doc, dict.get(PDFName.of('NP')));
    return {
      activationWhen: pdfNameToString(dict.get(PDFName.of('A'))) ?? undefined,
      deactivationWhen: pdfNameToString(dict.get(PDFName.of('D'))) ?? undefined,
      interactiveState: pdfNameToString(dict.get(PDFName.of('AIS'))) ?? undefined,
      toolbarEnabled: tbObj instanceof PDFBool ? tbObj.asBoolean() : true,
      navigationEnabled: npObj instanceof PDFBool ? npObj.asBoolean() : true,
    };
  };

  const decodeStreamBytes = (stream: PdfStreamLike): Uint8Array => {
    if (stream instanceof PDFRawStream) {
      try {
        return new Uint8Array(decodePDFRawStream(stream).decode());
      } catch {
        return new Uint8Array(stream.contents);
      }
    }
    return new Uint8Array(stream.getContents());
  };

  return {
    pdfNameToString,
    pdfTextToString,
    resolveRef,
    readRect,
    parseViewDict,
    parseActivationDict,
    decodeStreamBytes,
  };
}

function detect3DStreamFormat(bytes: Uint8Array, streamSubtype: string | null): Pdf3DStreamFormat {
  if (bytes.length >= 4) {
    const magicLE =
      (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
    if (magicLE === U3D_MAGIC_FILE_HEADER) return 'u3d';
  }
  if (bytes.length >= 3 && bytes[0] === 0x50 && bytes[1] === 0x52 && bytes[2] === 0x43) {
    return 'prc';
  }
  if (streamSubtype?.toUpperCase() === 'U3D') return 'u3d';
  if (streamSubtype?.toUpperCase() === 'PRC') return 'prc';
  return 'unknown';
}

/**
 * Extracts and parses all native ISO 32000-1 `/Subtype /3D` annotations (U3D & PRC)
 * from a PDF document buffer.
 */
export async function extractPdf3DAnnotations(
  pdfBytes: Uint8Array,
): Promise<Pdf3DExtractResult> {
  const lib = await pdfLib();
  const { PDFArray, PDFDict, PDFName, PDFStream } = lib;
  const h = createHelpers(lib);

  const doc = await lib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const annotations: Pdf3DAnnotationRecord[] = [];
  const docWarnings: string[] = [];

  pages.forEach((page, pageIdx) => {
    const pageNumber = pageIdx + 1;
    const annotsArr = h.resolveRef<PdfArrayLike>(
      doc,
      page.node.get(PDFName.of('Annots')),
    );
    if (!(annotsArr instanceof PDFArray)) return;

    for (let i = 0; i < annotsArr.size(); i++) {
      const annotDict = h.resolveRef<PdfDictLike>(doc, annotsArr.get(i));
      if (!(annotDict instanceof PDFDict)) continue;
      const subtype = h.pdfNameToString(annotDict.get(PDFName.of('Subtype')));
      if (subtype !== '3D') continue;

      const annotName =
        h.pdfTextToString(annotDict.get(PDFName.of('NM'))) ??
        h.pdfTextToString(annotDict.get(PDFName.of('T'))) ??
        `3D_Annot_P${pageNumber}_${i + 1}`;
      const rect = h.readRect(doc, annotDict);
      const activation = h.parseActivationDict(doc, annotDict.get(PDFName.of('3DA')));
      const warnings: string[] = [];

      const streamObj = h.resolveRef<PdfStreamLike>(
        doc,
        annotDict.get(PDFName.of('3DD')),
      );
      let streamSubtype: string | null = null;
      let decodedBytes: Uint8Array = new Uint8Array(0);
      const views: Pdf3DViewPreset[] = [];

      const directView = h.parseViewDict(doc, annotDict.get(PDFName.of('3DV')), 'Default');
      if (directView) views.push(directView);

      if (streamObj instanceof PDFStream) {
        streamSubtype = h.pdfNameToString(streamObj.dict.get(PDFName.of('Subtype')));
        decodedBytes = h.decodeStreamBytes(streamObj);

        const vaArr = h.resolveRef<PdfArrayLike>(
          doc,
          streamObj.dict.get(PDFName.of('VA')),
        );
        if (vaArr instanceof PDFArray) {
          for (let v = 0; v < vaArr.size(); v++) {
            const parsedView = h.parseViewDict(doc, vaArr.get(v), `View ${v + 1}`);
            if (parsedView && !views.some((existing) => existing.name === parsedView.name)) {
              views.push(parsedView);
            }
          }
        }
      } else {
        warnings.push('Annotation /3DD stream reference is missing or invalid.');
      }

      const format = detect3DStreamFormat(decodedBytes, streamSubtype);
      let meshes: CadExtrudedMesh3D[] = [];
      let u3dDetails: Pdf3DAnnotationRecord['u3dDetails'];
      let prcDetails: Pdf3DAnnotationRecord['prcDetails'];

      if (format === 'u3d') {
        u3dDetails = parseU3DBinary(decodedBytes);
        meshes = u3dDetails.meshes;
        warnings.push(...u3dDetails.warnings);
      } else if (format === 'prc') {
        prcDetails = inspectPrcBinary(decodedBytes);
        meshes = prcDetails.extractedMeshes;
        warnings.push(...prcDetails.warnings);
      } else {
        warnings.push('Unrecognized 3D stream payload format (neither U3D nor PRC).');
      }

      annotations.push({
        id: `pdf3d_p${pageNumber}_${i + 1}_${annotName.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        pageNumber,
        name: annotName,
        rect,
        format,
        streamSubtype,
        streamByteLength: decodedBytes.length,
        defaultView: directView ?? views[0] ?? null,
        views,
        activation,
        u3dDetails,
        prcDetails,
        meshes,
        warnings,
      });
    }
  });

  log('pdf-renderer', 'Extracted native 3D PDF annotations', {
    pageCount: pages.length,
    annotationCount: annotations.length,
  });

  return {
    pageCount: pages.length,
    annotationCount: annotations.length,
    annotations,
    warnings: docWarnings,
  };
}

/**
 * Embeds one or more 3D meshes as a standard ISO 32000-1 `/Subtype /3D` annotation
 * with an ECMA-363 U3D `/3DD` stream, default `/3DV` camera matrix, `/3DA` activation dict,
 * and optional 2D vector wireframe `/AP /N` fallback appearance onto a PDF page.
 * If `pdfBytes` is null, creates a blank sheet cleanly.
 */
export async function embedU3DMeshInPdf(
  pdfBytes: Uint8Array | null,
  meshes: CadExtrudedMesh3D[],
  options: Pdf3DEmbedOptions = {},
): Promise<{ pdfBytes: Uint8Array; u3dByteLength: number; annotationName: string }> {
  if (meshes.length === 0) {
    throw new Error('Cannot embed 3D PDF annotation with zero meshes.');
  }

  const lib = await pdfLib();
  const {
    PDFArray,
    PDFDocument,
    PDFName,
    PDFNumber,
    PDFRawStream,
    PDFRef,
    PDFString,
  } = lib;

  const doc = pdfBytes
    ? await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
    : await PDFDocument.create();
  if (doc.getPageCount() === 0) {
    doc.addPage([612, 792]);
  }

  const pages = doc.getPages();
  const pageIndex = Math.max(0, Math.min(pages.length - 1, options.pageIndex ?? 0));
  const page = pages[pageIndex];
  const { width: pageWidth, height: pageHeight } = page.getSize();

  const rect: [number, number, number, number] = options.rect ?? [
    Math.round(pageWidth * 0.1),
    Math.round(pageHeight * 0.18),
    Math.round(pageWidth * 0.9),
    Math.round(pageHeight * 0.85),
  ];

  const annotationName = options.annotationName?.trim() || 'DocCraft_3D_DigitalTwin';
  const viewName = options.viewName?.trim() || 'Isometric View';
  const bg = options.backgroundColor ?? [0.06, 0.09, 0.16];

  const u3dRaw = serializeMeshesToU3DBinary(meshes, { baseName: annotationName });
  const compressStream = options.compressStream ?? true;
  const streamPayload = compressStream ? zlibSync(u3dRaw) : u3dRaw;

  let totalVertCount = 0;
  for (const m of meshes) totalVertCount += m.vertexCount;
  const combinedVerts = new Float32Array(totalVertCount * 3);
  let cursor = 0;
  for (const m of meshes) {
    combinedVerts.set(m.vertices, cursor * 3);
    cursor += m.vertexCount;
  }
  const { bounds, centroid } = computeMeshMetrics(combinedVerts, new Uint32Array(0));
  const span = Math.max(
    10,
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ,
  );
  const orbitDist = span * 2.1;

  const cos45 = 0.70710678;
  const sin35 = 0.57735027;
  const cos35 = 0.81649658;
  const camX = centroid.x + orbitDist * 0.57735;
  const camY = centroid.y - orbitDist * 0.57735;
  const camZ = centroid.z + orbitDist * 0.57735;

  const viewDict = doc.context.obj({
    Type: '3DView',
    XN: PDFString.of(viewName),
    IN: PDFString.of(viewName),
    MS: 'M',
    C2W: [
      cos45, cos45, 0,
      -cos45 * sin35, cos45 * sin35, cos35,
      -0.57735, 0.57735, -0.57735,
      camX, camY, camZ,
    ],
    CO: Number(orbitDist.toFixed(2)),
    P: {
      Subtype: 'P',
      FOV: 45,
      PS: 'Min',
    },
    BG: {
      Type: '3DBG',
      Subtype: 'SC',
      CS: 'DeviceRGB',
      C: [bg[0], bg[1], bg[2]],
    },
    LS: {
      Type: '3DLS',
      Subtype: 'CAD',
    },
  });
  const viewRef = doc.context.register(viewDict);

  const streamDict = doc.context.obj({
    Type: PDFName.of('3D'),
    Subtype: PDFName.of('U3D'),
    VA: doc.context.obj([viewRef]),
    DV: PDFNumber.of(0),
    Length: PDFNumber.of(streamPayload.length),
  });
  if (compressStream) {
    streamDict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
  }
  const u3dStream = PDFRawStream.of(streamDict, streamPayload);
  const u3dStreamRef = doc.context.register(u3dStream);

  const activationDict = doc.context.obj({
    A: 'PO',
    D: 'PC',
    AIS: 'I',
    TB: true,
    NP: true,
  });
  const activationRef = doc.context.register(activationDict);

  let apDict: PdfDictLike | undefined;
  if (options.includeAppearancePreview ?? true) {
    const rw = Math.max(40, rect[2] - rect[0]);
    const rh = Math.max(30, rect[3] - rect[1]);
    const apStreamContent = [
      'q',
      '0.07 0.11 0.18 rg',
      `0 0 ${rw.toFixed(2)} ${rh.toFixed(2)} re f`,
      '0.22 0.74 0.97 RG 1.2 w',
      `2 2 ${(rw - 4).toFixed(2)} ${(rh - 4).toFixed(2)} re S`,
      `0 0 m ${rw.toFixed(2)} ${rh.toFixed(2)} l S`,
      `0 ${rh.toFixed(2)} m ${rw.toFixed(2)} 0 l S`,
      'Q',
    ].join('\n');
    const apDictObj = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Form',
      FormType: 1,
      BBox: [0, 0, rw, rh],
      Resources: doc.context.obj({}),
      Length: apStreamContent.length,
    });
    const apStream = PDFRawStream.of(
      apDictObj,
      new TextEncoder().encode(apStreamContent),
    );
    const apRef = doc.context.register(apStream);
    apDict = doc.context.obj({ N: apRef });
  }

  const annotDict = doc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('3D'),
    T: PDFString.of(annotationName),
    NM: PDFString.of(annotationName),
    Contents: PDFString.of(`Interactive 3D Digital Twin (${meshes.length} solid mesh(es))`),
    Rect: doc.context.obj(rect),
    F: PDFNumber.of(4),
    P: page.ref,
    '3DD': u3dStreamRef,
    '3DV': viewRef,
    '3DA': activationRef,
  });
  if (apDict) {
    annotDict.set(PDFName.of('AP'), apDict);
  }
  const annotRef = doc.context.register(annotDict);

  const existingAnnots = page.node.get(PDFName.of('Annots'));
  const annotsArray =
    existingAnnots instanceof PDFRef
      ? doc.context.lookup(existingAnnots)
      : existingAnnots;

  if (annotsArray instanceof PDFArray) {
    annotsArray.push(annotRef);
  } else {
    page.node.set(PDFName.of('Annots'), doc.context.obj([annotRef]));
  }

  const savedBytes = await doc.save();

  log('pdf-renderer', 'Embedded native U3D 3D annotation into PDF', {
    annotationName,
    pageIndex,
    meshCount: meshes.length,
    u3dByteLength: u3dRaw.length,
  });

  return {
    pdfBytes: savedBytes,
    u3dByteLength: u3dRaw.length,
    annotationName,
  };
}
