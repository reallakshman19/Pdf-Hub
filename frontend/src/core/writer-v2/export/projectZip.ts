import JSZip from 'jszip';
import type {
  WriterDocumentMetaV2,
  WriterDocumentMode,
  WriterElementV2,
} from '../types';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import type { OcrProjectPayloadV1 } from '../../ocr/ocrProjectCodec';
import {
  readOcrProjectPayloadFromReader,
  writeOcrProjectPayloadToZip,
} from '../../ocr/ocrProjectCodec';
import {
  JSZipProjectArchiveReader,
  type ProjectArchiveReader,
} from '@/core/admission/zip/projectArchiveReader';

export interface PdfHubWriterProjectManifestV1 {
  schema: 'pdf-hub-project';
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  documentFingerprint: string;
  documentMode?: WriterDocumentMode;
  source?: {
    kind: WriterDocumentMode;
    hasOriginalPdf: boolean;
  };
  files: {
    originalPdf?: 'original.pdf';
    writerElements: 'writer-elements.json';
    writerAssets: 'writer-assets.json';
    writerDocumentMeta?: 'writer-document-meta.json';
    assetDirectory: 'assets/';
    ocrManifest?: 'ocr/manifest.json';
  };
  counts: {
    writerElements: number;
    writerAssets: number;
    ocrPages?: number;
    ocrCorrections?: number;
    ocrRegions?: number;
    ocrWriterInsertionCandidates?: number;
  };
}

export interface ExportPdfHubProjectInput {
  originalPdfBytes?: Uint8Array | null;
  documentFingerprint: string;
  documentMeta?: WriterDocumentMetaV2 | null;
  elements: WriterElementV2[];
  assets?: WriterAssetRecordV2[];
  ocrProject?: OcrProjectPayloadV1 | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExportPdfHubProjectResult {
  bytes: Uint8Array;
  manifest: PdfHubWriterProjectManifestV1;
  elementCount: number;
  assetCount: number;
  ocrProjectIncluded: boolean;
}

export interface ImportPdfHubProjectResult {
  manifest: PdfHubWriterProjectManifestV1;
  /**
   * Backward-compatible field. Blank Writer projects intentionally have no
   * original PDF, so this is an empty Uint8Array and
   * manifest.source.hasOriginalPdf is false.
   */
  originalPdfBytes: Uint8Array;
  documentMeta?: WriterDocumentMetaV2 | null;
  elements: WriterElementV2[];
  assets: WriterAssetRecordV2[];
  ocrProject: OcrProjectPayloadV1 | null;
  compatibilityWarnings?: readonly string[];
}

interface StoredAssetMetadata {
  id: string;
  documentFingerprint: string;
  kind: 'image';
  mimeType: string;
  fileName: string;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
}

export async function exportPdfHubWriterProject(
  input: ExportPdfHubProjectInput,
): Promise<ExportPdfHubProjectResult> {
  const now = new Date().toISOString();
  const createdAt = input.createdAt ?? input.documentMeta?.createdAt ?? now;
  const updatedAt = input.updatedAt ?? input.documentMeta?.updatedAt ?? now;
  const zip = new JSZip();
  const assets = input.assets ?? [];
  const documentMode = input.documentMeta?.mode ?? 'pdfOverlay';
  const hasOriginalPdf = Boolean(input.originalPdfBytes?.length);

  if (documentMode === 'pdfOverlay' && !hasOriginalPdf) {
    throw new Error('PDF overlay projects require originalPdfBytes.');
  }

  const files: PdfHubWriterProjectManifestV1['files'] = {
    writerElements: 'writer-elements.json',
    writerAssets: 'writer-assets.json',
    assetDirectory: 'assets/',
  };

  if (hasOriginalPdf) {
    files.originalPdf = 'original.pdf';
  }

  if (input.documentMeta) {
    files.writerDocumentMeta = 'writer-document-meta.json';
  }

  if (input.ocrProject) {
    files.ocrManifest = 'ocr/manifest.json';
  }

  const manifest: PdfHubWriterProjectManifestV1 = {
    schema: 'pdf-hub-project',
    schemaVersion: 1,
    createdAt,
    updatedAt,
    documentFingerprint: input.documentFingerprint,
    documentMode,
    source: {
      kind: documentMode,
      hasOriginalPdf,
    },
    files,
    counts: {
      writerElements: input.elements.length,
      writerAssets: assets.length,
      ocrPages: input.ocrProject?.manifest.counts.pages,
      ocrCorrections: input.ocrProject?.manifest.counts.corrections,
      ocrRegions: input.ocrProject?.manifest.counts.regions,
      ocrWriterInsertionCandidates:
        input.ocrProject?.manifest.counts.writerInsertionCandidates,
    },
  };

  if (input.ocrProject) {
    await writeOcrProjectPayloadToZip(zip, input.ocrProject);
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  if (hasOriginalPdf && input.originalPdfBytes) {
    zip.file('original.pdf', input.originalPdfBytes);
  }

  if (input.documentMeta) {
    zip.file(
      'writer-document-meta.json',
      JSON.stringify(
        {
          ...input.documentMeta,
          documentFingerprint: input.documentFingerprint,
          updatedAt,
        },
        null,
        2,
      ),
    );
  }

  zip.file(
    'writer-elements.json',
    JSON.stringify(
      input.elements.map((element) => ({
        ...element,
        documentFingerprint: input.documentFingerprint,
        assetIds: element.assetIds ? [...element.assetIds] : undefined,
        rect: { ...element.rect },
        style: { ...element.style },
      })),
      null,
      2,
    ),
  );

  const storedAssets: StoredAssetMetadata[] = [];

  for (const asset of assets) {
    const fileName = assetFileName(asset);
    const dataBytes = dataUrlToBytes(asset.dataUrl);

    zip.file(`assets/${fileName}`, dataBytes);

    storedAssets.push({
      id: asset.id,
      documentFingerprint: input.documentFingerprint,
      kind: asset.kind,
      mimeType: asset.mimeType,
      fileName,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    });
  }

  zip.file('writer-assets.json', JSON.stringify(storedAssets, null, 2));

  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  });

  return {
    bytes,
    manifest,
    elementCount: input.elements.length,
    assetCount: assets.length,
    ocrProjectIncluded: Boolean(input.ocrProject),
  };
}

export async function importPdfHubWriterProject(
  projectBytes: Uint8Array,
): Promise<ImportPdfHubProjectResult> {
  const zip = await JSZip.loadAsync(projectBytes);
  return importPdfHubWriterProjectFromReader(new JSZipProjectArchiveReader(zip));
}

export async function importPdfHubWriterProjectFromReader(
  reader: ProjectArchiveReader,
): Promise<ImportPdfHubProjectResult> {
  const manifest = await readJsonFile<PdfHubWriterProjectManifestV1>(
    reader,
    'manifest.json',
  );

  validateManifest(manifest);

  const originalPdfBytes = manifest.files.originalPdf
    ? await readBinaryFile(reader, manifest.files.originalPdf)
    : new Uint8Array();

  const documentMeta = manifest.files.writerDocumentMeta
    ? await readJsonFile<WriterDocumentMetaV2>(
        reader,
        manifest.files.writerDocumentMeta,
      )
    : null;

  const elements = await readJsonFile<WriterElementV2[]>(
    reader,
    manifest.files.writerElements,
  );

  const storedAssets = await readJsonFile<StoredAssetMetadata[]>(
    reader,
    manifest.files.writerAssets,
  );

  const assets: WriterAssetRecordV2[] = [];

  for (const asset of storedAssets) {
    const bytes = await readBinaryFile(
      reader,
      `${manifest.files.assetDirectory}${asset.fileName}`,
    );

    assets.push({
      id: asset.id,
      documentFingerprint: manifest.documentFingerprint,
      kind: asset.kind,
      mimeType: asset.mimeType,
      dataUrl: bytesToDataUrl(bytes, asset.mimeType),
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    });
  }

  const ocrProject = await readOcrProjectPayloadFromReader(reader);
  const compatibilityWarnings: string[] = [];
  if (documentMeta && documentMeta.documentFingerprint !== manifest.documentFingerprint) {
    compatibilityWarnings.push('Writer document metadata fingerprint was normalized to the manifest fingerprint.');
  }
  for (const element of elements) {
    if (element.documentFingerprint !== manifest.documentFingerprint) {
      compatibilityWarnings.push(`Writer element ${element.id || '(unnamed)'} fingerprint was normalized to the manifest fingerprint.`);
    }
  }
  for (const asset of storedAssets) {
    if (asset.documentFingerprint !== manifest.documentFingerprint) {
      compatibilityWarnings.push(`Writer asset ${asset.id || '(unnamed)'} fingerprint was normalized to the manifest fingerprint.`);
    }
  }

  return {
    manifest,
    originalPdfBytes,
    documentMeta: documentMeta
      ? {
          ...documentMeta,
          documentFingerprint: manifest.documentFingerprint,
        }
      : null,
    elements: elements.map((element) => ({
      ...element,
      documentFingerprint: manifest.documentFingerprint,
      assetIds: element.assetIds ? [...element.assetIds] : undefined,
      rect: { ...element.rect },
      style: { ...element.style },
    })),
    assets,
    ocrProject,
    compatibilityWarnings: Object.freeze([...compatibilityWarnings]),
  };
}

function validateManifest(manifest: PdfHubWriterProjectManifestV1): void {
  if (manifest.schema !== 'pdf-hub-project') {
    throw new Error(`Unsupported project schema: ${manifest.schema}`);
  }

  if (manifest.schemaVersion !== 1) {
    throw new Error(
      `Unsupported project schemaVersion: ${manifest.schemaVersion}`,
    );
  }

  if (!manifest.documentFingerprint) {
    throw new Error('Project manifest is missing documentFingerprint.');
  }

  const isBlankDocument =
    manifest.documentMode === 'blankDocument' ||
    manifest.source?.kind === 'blankDocument';

  if (!isBlankDocument && !manifest.files.originalPdf) {
    throw new Error('PDF overlay project manifest is missing originalPdf.');
  }
}

async function readJsonFile<T>(reader: ProjectArchiveReader, path: string): Promise<T> {
  if (!reader.has(path)) {
    throw new Error(`Project ZIP missing required file: ${path}`);
  }

  return JSON.parse(await reader.readText(path)) as T;
}

async function readBinaryFile(
  reader: ProjectArchiveReader,
  path: string,
): Promise<Uint8Array> {
  if (!reader.has(path)) {
    throw new Error(`Project ZIP missing required file: ${path}`);
  }

  return reader.readBytes(path);
}

function assetFileName(asset: WriterAssetRecordV2): string {
  const ext = mimeExtension(asset.mimeType);
  return `${safeFilePart(asset.id)}.${ext}`;
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .slice(0, 160);
}

function mimeExtension(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'bin';
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const [, base64] = dataUrl.split(',');

  if (!base64) {
    throw new Error('Invalid asset data URL.');
  }

  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return ['data', `${mimeType};base64,${globalThis.btoa(binary)}`].join(':');
}
