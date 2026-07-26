import { PDFDocument } from 'pdf-lib';
import type { WriterDocumentMetaV2, WriterElementV2 } from '../types';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import { useWriterV2Store } from '../writerV2Store';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import {
  importPdfHubWriterProjectFromReader,
  type ImportPdfHubProjectResult,
  type PdfHubWriterProjectManifestV1,
} from './projectZip';
import { extractWriterProjectFromPdf } from './roundTripPdfImport';
import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import { inspectZipArchive } from '@/core/admission/zip/zipInventory';
import { admitZipArchive } from '@/core/admission/zip/zipAdmission';
import type { ZipArchiveInventory } from '@/core/admission/zip/zipTypes';
import {
  admitDeclaredZipResources,
  admitZipSourceBytes,
  admitZipSourceMetadata,
} from '@/core/admission/zip/zipDeclaredResourceAdmission';
import {
  extractZipMembersBounded,
  type ZipBoundedExtractionResult,
} from '@/core/admission/zip/zipBoundedExtraction';
import {
  BoundedZipMemberSetArchiveReader,
  releaseBoundedZipMemberSet,
} from '@/core/admission/zip/zipMemberSet';
import type { ProjectArchiveReader } from '@/core/admission/zip/projectArchiveReader';
import type { ZipBoundedExtractionEvidence } from '@/core/admission/zip/zipExtractionEvidence';

export interface ImportedProjectSession {
  originalPdfBytes: Uint8Array;
  documentFingerprint: string;
  documentMeta?: WriterDocumentMetaV2 | null;
  elementCount: number;
  assetCount: number;
}

export type WriterProjectImportOutcome =
  | 'staged'
  | 'committed'
  | 'rolled-back'
  | 'rejected'
  | 'cancelled'
  | 'superseded';

export interface WriterProjectImportDiagnostic {
  readonly severity: 'warning' | 'error' | 'info';
  readonly code: string;
  readonly message: string;
}

export interface WriterProjectImportEvidence {
  readonly profileId: 'WRITER_PROJECT_ZIP';
  readonly sourceRoute: 'WRITER_V2_TOOLBAR_STANDALONE_PROJECT';
  readonly fileName: string;
  readonly mimeType: string;
  readonly sourceBytes: number;
  readonly zipSignature: 'accepted' | 'rejected';
  readonly schema?: string;
  readonly schemaVersion?: number;
  readonly documentMode?: 'pdfOverlay' | 'blankDocument';
  readonly hasOriginalPdf?: boolean;
  readonly originalPdfPageCount?: number;
  readonly writerElementCount?: number;
  readonly writerAssetCount?: number;
  readonly countReconciled?: boolean;
  readonly outcome: WriterProjectImportOutcome;
  readonly commitTarget?: 'PDF_OVERLAY' | 'BLANK_WRITER';
  readonly diagnostics: readonly WriterProjectImportDiagnostic[];
  readonly zipStructuralAdmission: ZipArchiveInventory;
  readonly zipBoundedExtraction: ZipBoundedExtractionEvidence;
  readonly unresolvedPolicy: {
    readonly authority: 'UNRESOLVED_POLICY';
    readonly dimensions: readonly [
      'JSON_BYTES',
      'WRITER_ELEMENT_COUNT',
      'WRITER_ASSET_COUNT',
    ];
  };
}

export interface StandaloneWriterProjectOperation {
  readonly operationId: string;
  readonly generation: number;
  readonly signal?: AbortSignal;
  readonly isCurrent: () => boolean;
  readonly isMounted: () => boolean;
}

export interface StandaloneWriterProjectStageDependencies {
  readonly inspectArchive?: (bytes: Uint8Array) => ZipArchiveInventory;
  readonly extractMembers?: typeof extractZipMembersBounded;
  readonly decodeProject?: (
    reader: ProjectArchiveReader,
  ) => Promise<ImportPdfHubProjectResult>;
}

export interface StagedWriterProjectImport {
  readonly operationId: string;
  readonly generation: number;
  readonly documentFingerprint: string;
  readonly documentMode: 'pdfOverlay' | 'blankDocument';
  readonly evidence: WriterProjectImportEvidence;
}

interface ProtectedProject {
  readonly manifest: PdfHubWriterProjectManifestV1;
  readonly originalPdfBytes: Uint8Array;
  readonly originalPdfPageCount: number;
  readonly documentMeta: WriterDocumentMetaV2 | null;
  readonly elements: readonly WriterElementV2[];
  readonly assets: readonly WriterAssetRecordV2[];
  readonly ocrProject: ImportPdfHubProjectResult['ocrProject'];
}

interface RegisteredStage {
  project: ProtectedProject | null;
  readonly operationId: string;
  readonly generation: number;
  readonly operation: StandaloneWriterProjectOperation;
  consumed: boolean;
  revoked: boolean;
}

interface StandaloneWriterProjectDecodeResult {
  readonly imported: ImportPdfHubProjectResult;
  readonly inventory: ZipArchiveInventory;
  readonly extractionEvidence: ZipBoundedExtractionEvidence;
}

const stagedRegistry = new WeakMap<StagedWriterProjectImport, RegisteredStage>();

export async function stageStandaloneWriterProject(
  file: File,
  operation: StandaloneWriterProjectOperation,
  dependencies: StandaloneWriterProjectStageDependencies = {},
): Promise<StagedWriterProjectImport> {
  const diagnostics: WriterProjectImportDiagnostic[] = [];
  assertOperationCurrent(operation, 'standalone Writer project metadata');

  const lowerName = file.name.toLowerCase();
  const extensionIdentifiesZip = lowerName.endsWith('.pdfhub.zip') || lowerName.endsWith('.zip');
  const mimeIdentifiesZip = file.type.toLowerCase() === 'application/zip';

  if (!extensionIdentifiesZip && !mimeIdentifiesZip) {
    throw new Error('Selected file is not identified as a Writer project ZIP.');
  }
  if (!extensionIdentifiesZip) {
    diagnostics.push({
      severity: 'warning',
      code: 'WRITER_PROJECT_EXTENSION_MISMATCH',
      message: 'Writer project has ZIP MIME metadata but no .zip extension.',
    });
  }
  if (!mimeIdentifiesZip) {
    diagnostics.push({
      severity: 'warning',
      code: 'WRITER_PROJECT_MIME_MISMATCH',
      message: `Writer project has a ZIP extension but MIME type ${file.type || 'unknown'}.`,
    });
  }

  const decoded = await decodeStandaloneWriterProject(file, operation, dependencies);
  const { imported, inventory, extractionEvidence } = decoded;
  const reconciled = await reconcileImportedProject(imported, operation, diagnostics);
  assertOperationCurrent(operation, 'standalone Writer project before staging');

  const evidence = deepFreeze({
    profileId: 'WRITER_PROJECT_ZIP' as const,
    sourceRoute: 'WRITER_V2_TOOLBAR_STANDALONE_PROJECT' as const,
    fileName: file.name,
    mimeType: file.type,
    sourceBytes: extractionEvidence.sourceBytes,
    zipSignature: 'accepted' as const,
    zipStructuralAdmission: inventory,
    zipBoundedExtraction: extractionEvidence,
    schema: imported.manifest.schema,
    schemaVersion: imported.manifest.schemaVersion,
    documentMode: reconciled.documentMeta?.mode ?? inferredMode(imported),
    hasOriginalPdf: reconciled.originalPdfBytes.byteLength > 0,
    originalPdfPageCount: reconciled.originalPdfPageCount || undefined,
    writerElementCount: reconciled.elements.length,
    writerAssetCount: reconciled.assets.length,
    countReconciled: true,
    outcome: 'staged' as const,
    commitTarget:
      (reconciled.documentMeta?.mode ?? inferredMode(imported)) === 'blankDocument'
        ? 'BLANK_WRITER' as const
        : 'PDF_OVERLAY' as const,
    diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })),
    unresolvedPolicy: {
      authority: 'UNRESOLVED_POLICY' as const,
      dimensions: [
        'JSON_BYTES',
        'WRITER_ELEMENT_COUNT',
        'WRITER_ASSET_COUNT',
      ] as const,
    },
  });

  const capability: StagedWriterProjectImport = Object.freeze({
    operationId: operation.operationId,
    generation: operation.generation,
    documentFingerprint: imported.manifest.documentFingerprint,
    documentMode: reconciled.documentMeta?.mode ?? inferredMode(imported),
    evidence,
  });

  stagedRegistry.set(capability, {
    project: reconciled,
    operationId: operation.operationId,
    generation: operation.generation,
    operation,
    consumed: false,
    revoked: false,
  });
  return capability;
}

async function decodeStandaloneWriterProject(
  file: File,
  operation: StandaloneWriterProjectOperation,
  dependencies: StandaloneWriterProjectStageDependencies,
): Promise<StandaloneWriterProjectDecodeResult> {
  let projectBytes: Uint8Array | null = null;
  let extracted: ZipBoundedExtractionResult | null = null;

  try {
    assertOperationCurrent(operation, 'standalone Writer project before source policy admission');
    admitZipSourceMetadata(file.size);
    assertOperationCurrent(operation, 'standalone Writer project before read');
    const buffer = await raceWithAbort(
      file.arrayBuffer(),
      operation.signal,
      'standalone Writer project file read',
    );
    assertOperationCurrent(operation, 'standalone Writer project after read');
    projectBytes = new Uint8Array(buffer);
    admitZipSourceBytes(file.size, projectBytes.byteLength);

    if (!hasZipSignature(projectBytes)) {
      throw new Error('Writer project ZIP signature is missing.');
    }

    assertOperationCurrent(operation, 'standalone Writer project before raw ZIP inspection');
    const inventory = (dependencies.inspectArchive ?? inspectZipArchive)(projectBytes);
    assertOperationCurrent(operation, 'standalone Writer project after raw ZIP inspection');
    admitZipArchive(inventory);

    assertOperationCurrent(operation, 'standalone Writer project before declared ZIP admission');
    const declaredAdmission = admitDeclaredZipResources(
      inventory,
      projectBytes.byteLength,
    );
    assertOperationCurrent(operation, 'standalone Writer project after declared ZIP admission');

    assertOperationCurrent(operation, 'standalone Writer project before bounded extraction');
    extracted = await (dependencies.extractMembers ?? extractZipMembersBounded)(
      projectBytes,
      inventory,
      declaredAdmission,
      operation,
    );
    assertOperationCurrent(operation, 'standalone Writer project after bounded extraction');

    const reader = new BoundedZipMemberSetArchiveReader(extracted.memberSet);
    assertOperationCurrent(operation, 'standalone Writer project before semantic ZIP decode');
    const imported = await raceWithAbort(
      (dependencies.decodeProject ?? importPdfHubWriterProjectFromReader)(reader),
      operation.signal,
      'standalone Writer project semantic ZIP decode',
    );
    assertOperationCurrent(operation, 'standalone Writer project after semantic ZIP decode');

    return Object.freeze({
      imported,
      inventory,
      extractionEvidence: extracted.evidence,
    });
  } finally {
    if (extracted) releaseBoundedZipMemberSet(extracted.memberSet);
    extracted = null;
    projectBytes = null;
  }
}

export function revokeStagedWriterProjectImport(stage: StagedWriterProjectImport): void {
  const registered = stagedRegistry.get(stage);
  if (!registered) return;
  registered.revoked = true;
  registered.project = null;
}

export async function commitStagedWriterProjectImport(
  stage: StagedWriterProjectImport,
  operation: StandaloneWriterProjectOperation,
  hooks?: {
    readonly afterSessionMutation?: () => void;
  },
): Promise<ImportedProjectSession> {
  const registered = assertUsableStage(stage, operation);
  const project = registered.project;
  if (!project) {
    throw new Error('Staged Writer project payload is no longer available.');
  }

  assertOperationCurrent(operation, 'standalone Writer project before commit');
  registered.consumed = true;

  const sessionSnapshot = useSessionStore.getState();
  const writerSnapshot = useWriterV2Store.getState();
  const editorSnapshot = useEditorStore.getState();

  try {
    const mode = project.documentMeta?.mode ?? inferredModeFromProject(project);
    if (mode === 'pdfOverlay') {
      useSessionStore.getState().openDocument({
        documentKey: project.manifest.documentFingerprint,
        fileName: 'imported-writer-project.pdf',
        bytes: project.originalPdfBytes,
        pageCount: project.originalPdfPageCount,
      });
    } else {
      useSessionStore.getState().clearDocument();
    }

    hooks?.afterSessionMutation?.();
    assertOperationCurrent(operation, 'standalone Writer project during commit');

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: project.manifest.documentFingerprint,
      elements: project.elements.map(cloneElement),
      assetRecords: project.assets.map(cloneAsset),
      persistedAt: project.manifest.updatedAt,
      documentMeta: project.documentMeta ? cloneDocumentMeta(project.documentMeta) : null,
    });
    useEditorStore.getState().setActiveMode('write');
    assertOperationCurrent(operation, 'standalone Writer project after commit');

    return {
      originalPdfBytes: new Uint8Array(project.originalPdfBytes),
      documentFingerprint: project.manifest.documentFingerprint,
      documentMeta: project.documentMeta ? cloneDocumentMeta(project.documentMeta) : null,
      elementCount: project.elements.length,
      assetCount: project.assets.length,
    };
  } catch (error) {
    useSessionStore.setState(sessionSnapshot, true);
    useWriterV2Store.setState(writerSnapshot, true);
    useEditorStore.setState(editorSnapshot, true);
    throw error;
  } finally {
    registered.revoked = true;
    registered.project = null;
  }
}

/**
 * Round-trip PDF import remains the compatibility path used by editable PDFs.
 * Its existing hydration semantics are intentionally unchanged in Phase 3A.1.
 */
export async function importRoundTripPdfIntoWriterStore(
  pdfBytes: Uint8Array,
): Promise<ImportedProjectSession | null> {
  const imported = await extractWriterProjectFromPdf(pdfBytes);
  if (!imported) return null;
  hydrateImportedProject(imported);
  return toSession(imported);
}

async function reconcileImportedProject(
  imported: ImportPdfHubProjectResult,
  operation: StandaloneWriterProjectOperation,
  diagnostics: WriterProjectImportDiagnostic[],
): Promise<ProtectedProject> {
  const manifest = imported.manifest;
  if (manifest.schema !== 'pdf-hub-project' || manifest.schemaVersion !== 1) {
    throw new Error('Writer project manifest schema is not supported.');
  }
  if (!manifest.documentFingerprint.trim()) {
    throw new Error('Writer project manifest is missing documentFingerprint.');
  }
  if (manifest.counts.writerElements !== imported.elements.length) {
    throw new Error('Writer project element count does not match its manifest.');
  }
  if (manifest.counts.writerAssets !== imported.assets.length) {
    throw new Error('Writer project asset count does not match its manifest.');
  }

  validateUniqueIds(imported.elements.map((element) => element.id), 'Writer element');
  validateUniqueIds(imported.assets.map((asset) => asset.id), 'Writer asset');
  validateAssetReferences(imported.elements, imported.assets);

  for (const warning of imported.compatibilityWarnings ?? []) {
    diagnostics.push({
      severity: 'warning',
      code: 'WRITER_PROJECT_FINGERPRINT_NORMALIZED',
      message: warning,
    });
  }

  const declaredModes = [
    imported.documentMeta?.mode,
    manifest.documentMode,
    manifest.source?.kind,
  ].filter((value): value is 'pdfOverlay' | 'blankDocument' =>
    value === 'pdfOverlay' || value === 'blankDocument',
  );
  if (new Set(declaredModes).size > 1) {
    throw new Error('Writer project contains contradictory document mode declarations.');
  }
  const mode = declaredModes[0] ?? 'pdfOverlay';
  const hasOriginalPdf = imported.originalPdfBytes.byteLength > 0;
  if (mode === 'pdfOverlay') {
    if (!manifest.files.originalPdf || manifest.source?.hasOriginalPdf === false || !hasOriginalPdf) {
      throw new Error('PDF-overlay Writer project has contradictory original PDF declarations.');
    }
  } else if (
    manifest.files.originalPdf ||
    manifest.source?.hasOriginalPdf === true ||
    hasOriginalPdf ||
    imported.documentMeta?.mode === 'pdfOverlay'
  ) {
    throw new Error('Blank Writer project contradicts its original PDF declarations.');
  }

  let pageCount = 0;
  if (mode === 'pdfOverlay') {
    if (!hasPdfSignature(imported.originalPdfBytes)) {
      throw new Error('Writer project original PDF signature is missing.');
    }
    assertOperationCurrent(operation, 'Writer project before original PDF validation');
    try {
      const pdf = await raceWithAbort(
        PDFDocument.load(imported.originalPdfBytes),
        operation.signal,
        'Writer project original PDF validation',
      );
      assertOperationCurrent(operation, 'Writer project after original PDF validation');
      pageCount = pdf.getPageCount();
    } catch (error) {
      if (isOperationCancelledError(error)) throw error;
      throw new Error('Writer project original PDF could not be parsed.');
    }
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new Error('Writer project original PDF has an invalid page count.');
    }
  } else {
    if (!imported.documentMeta || imported.documentMeta.mode !== 'blankDocument') {
      throw new Error('Blank Writer project is missing blank-document metadata.');
    }
    if (!Number.isInteger(imported.documentMeta.pageCount) || imported.documentMeta.pageCount < 1) {
      throw new Error('Blank Writer project has an invalid page count.');
    }
  }

  return deepFreeze({
    manifest: cloneManifest(manifest),
    originalPdfBytes: new Uint8Array(imported.originalPdfBytes),
    originalPdfPageCount: pageCount,
    documentMeta: imported.documentMeta ? cloneDocumentMeta(imported.documentMeta) : null,
    elements: imported.elements.map(cloneElement),
    assets: imported.assets.map(cloneAsset),
    ocrProject: imported.ocrProject,
  });
}

function assertUsableStage(
  stage: StagedWriterProjectImport,
  operation: StandaloneWriterProjectOperation,
): RegisteredStage {
  const registered = stagedRegistry.get(stage);
  if (!registered) throw new Error('Writer project staged capability is invalid.');
  if (registered.consumed) throw new Error('Writer project staged capability was already consumed.');
  if (registered.revoked) throw new Error('Writer project staged capability was revoked.');
  if (
    registered.operation !== operation ||
    registered.operationId !== operation.operationId ||
    registered.generation !== operation.generation ||
    stage.operationId !== operation.operationId ||
    stage.generation !== operation.generation
  ) {
    throw new Error('Writer project staged capability operation identity does not match.');
  }
  assertOperationCurrent(operation, 'Writer project capability validation');
  return registered;
}

function assertOperationCurrent(
  operation: StandaloneWriterProjectOperation,
  checkpoint: string,
): void {
  throwIfAborted(operation.signal, checkpoint);
  if (!operation.isMounted()) {
    throw new Error('Writer project import component is no longer mounted.');
  }
  if (!operation.isCurrent()) {
    throw new Error('Writer project import was superseded by a newer operation.');
  }
}

function validateUniqueIds(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || !id.trim()) throw new Error(`${label} ID must be non-empty.`);
    if (seen.has(id)) throw new Error(`${label} IDs must be unique: ${id}.`);
    seen.add(id);
  }
}

function validateAssetReferences(
  elements: readonly WriterElementV2[],
  assets: readonly WriterAssetRecordV2[],
): void {
  const assetIds = new Set(assets.map((asset) => asset.id));
  for (const element of elements) {
    if (element.assetIds === undefined) continue;
    if (!Array.isArray(element.assetIds)) {
      throw new Error(`Writer element ${element.id} contains malformed asset references.`);
    }
    const seen = new Set<string>();
    for (const assetId of element.assetIds) {
      if (typeof assetId !== 'string' || !assetId.trim()) {
        throw new Error(`Writer element ${element.id} contains a malformed asset reference.`);
      }
      if (seen.has(assetId)) {
        throw new Error(`Writer element ${element.id} contains duplicate asset reference ${assetId}.`);
      }
      if (!assetIds.has(assetId)) {
        throw new Error(`Writer element ${element.id} references missing asset ${assetId}.`);
      }
      seen.add(assetId);
    }
  }
}

function inferredMode(imported: ImportPdfHubProjectResult): 'pdfOverlay' | 'blankDocument' {
  return imported.documentMeta?.mode ??
    imported.manifest.documentMode ??
    imported.manifest.source?.kind ??
    'pdfOverlay';
}

function inferredModeFromProject(project: ProtectedProject): 'pdfOverlay' | 'blankDocument' {
  return project.documentMeta?.mode ??
    project.manifest.documentMode ??
    project.manifest.source?.kind ??
    'pdfOverlay';
}

function hasZipSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0x50 && bytes[1] === 0x4b && (
    (bytes[2] === 0x03 && bytes[3] === 0x04) ||
    (bytes[2] === 0x05 && bytes[3] === 0x06) ||
    (bytes[2] === 0x07 && bytes[3] === 0x08)
  );
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d];
  const length = Math.min(bytes.length, 1024);
  for (let index = 0; index <= length - signature.length; index += 1) {
    if (signature.every((value, offset) => bytes[index + offset] === value)) return true;
  }
  return false;
}

function toSession(imported: ImportPdfHubProjectResult): ImportedProjectSession {
  return {
    originalPdfBytes: imported.originalPdfBytes,
    documentFingerprint: imported.manifest.documentFingerprint,
    documentMeta: imported.documentMeta,
    elementCount: imported.elements.length,
    assetCount: imported.assets.length,
  };
}

function hydrateImportedProject(imported: ImportPdfHubProjectResult): void {
  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint: imported.manifest.documentFingerprint,
    elements: imported.elements,
    assetRecords: imported.assets,
    persistedAt: imported.manifest.updatedAt,
    documentMeta: imported.documentMeta,
  });
}

function cloneManifest(manifest: PdfHubWriterProjectManifestV1): PdfHubWriterProjectManifestV1 {
  return {
    ...manifest,
    source: manifest.source ? { ...manifest.source } : undefined,
    files: { ...manifest.files },
    counts: { ...manifest.counts },
  };
}

function cloneDocumentMeta(meta: WriterDocumentMetaV2): WriterDocumentMetaV2 {
  return {
    ...meta,
    pageSetup: { ...meta.pageSetup },
  };
}

function cloneElement(element: WriterElementV2): WriterElementV2 {
  return {
    ...element,
    rect: { ...element.rect },
    style: { ...element.style },
    assetIds: element.assetIds ? [...element.assetIds] : undefined,
  };
}

function cloneAsset(asset: WriterAssetRecordV2): WriterAssetRecordV2 {
  return { ...asset };
}

function deepFreeze<T>(value: T): T {
  if (ArrayBuffer.isView(value)) return value;
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
