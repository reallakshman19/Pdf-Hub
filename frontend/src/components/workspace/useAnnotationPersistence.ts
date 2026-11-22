import React from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadAnnotationSnapshotOrNull, saveAnnotations } from '@/core/annotations/persistence';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { useToastStore } from '@/core/toast/store';
import { debug as logDebug, error as logError, warn as logWarn } from '@/core/logger/service';
import { summarizeNativeAnnotationCoverage } from '@/core/pdf-annotations/nativeCoverageAudit';
import {
  authorizedEditFields,
  isValidNativeDeletionTombstone,
  type NativeDeletionTombstone,
  type NativeIntegrityState,
} from '@/core/annotations/nativeIntegrity';
import { ensureAnnotationHasNormalizedGeometry } from '@/core/annotations/normalized';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from '@/core/pdf-annotations/nativeAnnotationReader';

/** Stable across local edits: a native PDF object belongs to one source page. */
function nativeSourceKey(annotation: PdfAnnotation): string {
  return JSON.stringify([
    annotation.pageNumber,
    annotation.data.nativeSourceRef ?? annotation.data.nativeOriginalName ?? annotation.id,
  ]);
}

function addUniqueSourceMatch(
  matches: Map<string, PdfAnnotation>,
  ambiguous: Set<string>,
  key: string,
  item: PdfAnnotation,
): void {
  if (ambiguous.has(key)) return;
  if (matches.has(key)) {
    matches.delete(key);
    ambiguous.add(key);
    return;
  }
  matches.set(key, item);
}

interface UseAnnotationPersistenceArgs {
  documentKey: string | null;
  pdfDoc: PDFDocumentProxy | null;
  workingBytes: Uint8Array | null;
  annotations: PdfAnnotation[];
  setAnnotations: (annotations: PdfAnnotation[]) => void;
  setRestoredCount: (count: number) => void;
}

export function useAnnotationPersistence({
  documentKey,
  pdfDoc,
  workingBytes,
  annotations,
  setAnnotations,
  setRestoredCount,
}: UseAnnotationPersistenceArgs): void {
  const hydratedDocumentKey = useAnnotationStore((state) => state.hydratedDocumentKey);
  const nativeDeletionTombstones = useAnnotationStore((state) => state.nativeDeletionTombstones);
  // A parent may supply a freshly allocated callback on every render. Only
  // the PDF revision, not that callback identity, may restart source hydration.
  const restoredCountCallback = React.useRef(setRestoredCount);
  React.useLayoutEffect(() => {
    restoredCountCallback.current = setRestoredCount;
  }, [setRestoredCount]);
  React.useEffect(() => {
    let cancelled = false;
    const loadStored = async () => {
      if (!documentKey || !workingBytes) return;
      restoredCountCallback.current(0);
      useAnnotationStore.setState({
        hydratedDocumentKey: null,
        nativeIntegrity: { status: 'LOADING', documentKey },
        nativeDeletionTombstones: [],
      });
      const before = useAnnotationStore.getState().annotations;
      // Local recovery metadata must never block source-native PDF import.
      // An unavailable IndexedDB cache is an inconvenience, not a reason to
      // display genuinely native annotations as an uneditable flat page.
      let snapshot: Awaited<ReturnType<typeof loadAnnotationSnapshotOrNull>> = null;
      let cacheUnavailable = false;
      try {
        snapshot = await loadAnnotationSnapshotOrNull(documentKey);
      } catch (err) {
        cacheUnavailable = true;
        if (!cancelled) logError('annotation', 'Native overlay cache unavailable; importing from PDF', {
          error: String(err), documentKey,
        });
      }
      const stored = snapshot?.annotations ?? null;
      let imported: Awaited<ReturnType<typeof readNativePdfAnnotations>>;
      try {
        imported = await readNativePdfAnnotations(workingBytes);
      } catch (err) {
        if (!cancelled) {
          useAnnotationStore.setState({
            nativeIntegrity: { status: 'FAILED', documentKey, reason: 'Native PDF parser failed' },
          });
          logError('annotation', 'Failed to parse native PDF annotations', {
            error: String(err), documentKey,
          });
          useToastStore.getState().addToast({
            type: 'error',
            title: 'Native annotations unavailable',
            message: 'PDF annotation import failed. Source markup may be visible only in another viewer; the PDF was not flattened.',
          });
        }
        return;
      }
      if (cancelled || useSessionStore.getState().documentKey !== documentKey
        || useSessionStore.getState().workingBytes !== workingBytes) return;
      if (useAnnotationStore.getState().annotations !== before) {
        throw new Error('Annotations changed before the native document finished loading.');
      }
      const sourceByKey = new Map<string, PdfAnnotation>();
      const sourceByRef = new Map<string, PdfAnnotation>();
      const sourceByText = new Map<string, PdfAnnotation>();
      const sourceByPos = new Map<string, PdfAnnotation>();
      const ambiguousText = new Set<string>();
      const ambiguousPos = new Set<string>();
      for (const item of imported.annotations) {
        if (item.data.nativeSourceRef) {
          sourceByRef.set(`${item.pageNumber}\u0000${item.data.nativeSourceRef}`, item);
        }
        sourceByKey.set(`${item.pageNumber}\u0000${item.id}`, item);
        if (item.data.nativeOriginalName) {
          sourceByKey.set(`${item.pageNumber}\u0000${item.data.nativeOriginalName}`, item);
        }
        const strippedId = item.id.replace(/^pdfhub-native-p\d+:/, '');
        sourceByKey.set(`${item.pageNumber}\u0000${strippedId}`, item);
        if (item.data.text) {
          const normText = item.data.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
          addUniqueSourceMatch(sourceByText, ambiguousText, `${item.pageNumber}\u0000${normText}`, item);
        }
        addUniqueSourceMatch(sourceByPos, ambiguousPos, `${item.pageNumber}\u0000${Math.round(item.rect.x)}:${Math.round(item.rect.y)}`, item);
      }
      // Legacy source-key baselines are NOT deletion authorization. Only a
      // persisted explicit deletion command for the exact original PDF object
      // can omit that object during recovery.
      const sourceIds = new Set(imported.annotations.map(nativeSourceKey));
      const pageIds = useSessionStore.getState().pageGraph?.pages ?? [];
      const persistedTombstones = snapshot?.nativeDeletionTombstones ?? [];
      // The source appearing in a recovered snapshot means a deletion was
      // undone or conflicted with the cached model. Favor preservation and
      // revoke the stale command before it can suppress a future import.
      const restoredNativeKeys = new Set((snapshot?.annotations ?? [])
        .filter((item) => item.data.nativeSourceRef && !item.data.nativeCopySource)
        .map(nativeSourceKey));
      const validTombstones: NativeDeletionTombstone[] = [];
      const invalidTombstones: NativeDeletionTombstone[] = [];
      for (const item of persistedTombstones) {
        const key = JSON.stringify([item.pageNumber, item.sourceRef]);
        if (restoredNativeKeys.has(key)) continue; // Undo wins over stale tombstone.
        if (isValidNativeDeletionTombstone(item)
          && item.sourceRevision === documentKey
          && sourceIds.has(key)
          && pageIds[item.pageNumber - 1]?.pageId === item.pageId) {
          validTombstones.push(item);
        } else invalidTombstones.push(item);
      }
      const deletedSourceKeys = new Set(validTombstones.map((item) =>
        JSON.stringify([item.pageNumber, item.sourceRef])));
      const unmatchedCachedNative: string[] = [];
      const unresolvedCachedEdits: string[] = [];
      const matchedSourceKeys = new Set<string>();
      const restored = stored === null ? imported.annotations : stored.map((item) => {
        const origin = item.data.nativeCopySource;
        const pageNum = origin?.pageNumber ?? item.pageNumber;
        const rawKey = origin?.nativeName ?? item.data.nativeOriginalName ?? item.id;
        const normItemText = item.data.text
          ? item.data.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
          : '';
        // Do not identify an application-created overlay as a PDF native
        // object solely because its text or coordinates happen to overlap.
        const canMatchByAppearance = Boolean(
          origin || item.data.nativeSourceRef || item.data.nativeOriginalName
          || item.id.startsWith('native:p') || item.id.startsWith('pdfhub-native-p'),
        );
        const source = item.data.nativeSourceRef && !origin
          ? sourceByRef.get(`${pageNum}\u0000${item.data.nativeSourceRef}`)
          : sourceByKey.get(`${pageNum}\u0000${rawKey}`)
            ?? sourceByKey.get(`${pageNum}\u0000${rawKey.replace(/^pdfhub-native-p\d+:/, '')}`)
            ?? sourceByKey.get(`${pageNum}\u0000${item.id}`)
            ?? (canMatchByAppearance && normItemText
              ? sourceByText.get(`${pageNum}\u0000${normItemText}`)
              : undefined)
            ?? (canMatchByAppearance
              ? sourceByPos.get(`${pageNum}\u0000${Math.round(item.rect.x)}:${Math.round(item.rect.y)}`)
              : undefined);
        if (!source && item.data.nativeSourceRef && !origin) {
          unmatchedCachedNative.push(nativeSourceKey(item));
        }
        // A copied overlay can reference its original source without
        // representing that native object on the source page.
        if (source && !origin) matchedSourceKeys.add(nativeSourceKey(source));
        const data = { ...item.data };
        delete data.nativeSourceRef;
        delete data.nativeAppearanceRef;
        delete data.nativeAppearanceRect;
        delete data.nativeAppearanceBodyRect;
        delete data.nativeAppearanceImported;
        delete data.nativeAppearanceRotation;
        delete data.nativeAppearancePageRotation;
        delete data.nativeStampRotationReadOnly;
        delete data.nativeBoxShapeImported;
        delete data.nativeBoxShapeHasAppearance;
        delete data.nativeBoxShapeSourceHash;
        delete data.nativeBoxShapeGenerated;
        delete data.nativeBoxShapeGeneratedOrientation;
        delete data.nativeMarkupRotationSourceHash;
        delete data.nativeMarkupPreviewOffset;
        delete data.nativeMarkupGeneratedAppearance;
        let effectiveRect = item.rect;
        // The actual /Subtype and /IT own the native type. A stale sidecar
        // cannot silently convert an unchanged /FreeText into a callout.
        const resolvedType: PdfAnnotation['type'] = origin ? item.type : source?.type ?? item.type;
        if (source) {
          // A sidecar cannot authorize a visual edit without revision-bound,
          // per-field user edit provenance. Source fields win by default.
          const edited = origin ? new Set<string>() : authorizedEditFields(item, source, documentKey);
          if (!origin && item.data.nativeSourceRef) {
            const unproven = (['rect', 'text', 'anchor', 'knee', 'leaderStyle', 'arrowHead'] as const)
              .some((field) => !edited.has(field) && (
                field === 'rect'
                  ? JSON.stringify(item.rect) !== JSON.stringify(source.rect)
                  : JSON.stringify(item.data[field]) !== JSON.stringify(source.data[field])
              ));
            if (unproven) unresolvedCachedEdits.push(nativeSourceKey(source));
          }
          if (!edited.size) delete data.nativeEditProvenance;
          delete data.nativeMarkupDraft;
          if (!edited.has('rect')) effectiveRect = source.rect;
          for (const key of ['anchor', 'knee', 'leaderStyle', 'arrowHead', 'text'] as const) {
            if (edited.has(key)) continue;
            if (source.data[key] !== undefined) {
              (data as Record<string, unknown>)[key] = source.data[key];
            } else {
              delete data[key];
            }
          }
          if (resolvedType === 'callout' || resolvedType === 'textbox') {
            if (source.data.borderColor) data.borderColor = source.data.borderColor;
            if (source.data.backgroundColor) data.backgroundColor = source.data.backgroundColor;
            if (typeof source.data.textColor === 'string') data.textColor = source.data.textColor;
            if (typeof source.data.fontFamily === 'string') data.fontFamily = source.data.fontFamily;
            if (typeof source.data.borderWidth === 'number') data.borderWidth = source.data.borderWidth;
          }
          // Classify from the native source, never a potentially stale
          // editable/generated flag restored from a sidecar.
          if (item.type === 'stamp') {
            if (source.data.nativeStampAppearanceKind) data.nativeStampAppearanceKind = source.data.nativeStampAppearanceKind;
            else delete data.nativeStampAppearanceKind;
            if (source.data.nativeStampAppearanceKind === 'generated') {
              const sourceBasis = source.data.nativeStampBasisRotation ?? 0;
              const graph = useSessionStore.getState().pageGraph;
              const sourceRotation = graph?.pages[(origin?.pageNumber ?? source.pageNumber) - 1]?.rotation
                ?? source.data.nativeAppearancePageRotation;
              const targetRotation = graph?.pages[item.pageNumber - 1]?.rotation;
              data.nativeStampBasisRotation = origin && sourceRotation !== undefined && targetRotation !== undefined
                ? ((sourceBasis + targetRotation - sourceRotation) % 360 + 360) % 360 : sourceBasis;
              if (origin) data.nativeStampCopySourceBasisRotation = sourceBasis;
              else delete data.nativeStampCopySourceBasisRotation;
            } else {
              delete data.nativeStampBasisRotation;
              delete data.nativeStampCopySourceBasisRotation;
            }
            if (source.data.hasCustomAppearance) data.hasCustomAppearance = true;
            else delete data.hasCustomAppearance;
            if (source.data.nativeStampRotationReadOnly) data.nativeStampRotationReadOnly = true;
          }
          if (item.type === 'shape-rect' || item.type === 'shape-ellipse' || item.type === 'shape-cloud') {
            data.nativeBoxShapeImported = true;
            data.nativeBoxShapeHasAppearance = Boolean(source.data.nativeBoxShapeHasAppearance);
            if (source.data.nativeBoxShapeSourceHash) data.nativeBoxShapeSourceHash = source.data.nativeBoxShapeSourceHash;
            if (source.data.nativeBoxShapeGenerated) {
              data.nativeBoxShapeGenerated = true;
              data.nativeBoxShapeGeneratedOrientation = source.data.nativeBoxShapeGeneratedOrientation;
            }
          }
          if (source.data.nativeMarkupRotationSourceHash) {
            data.nativeMarkupRotationSourceHash = source.data.nativeMarkupRotationSourceHash;
            if (source.data.nativeMarkupGeneratedAppearance) data.nativeMarkupGeneratedAppearance = true;
            const graph = useSessionStore.getState().pageGraph;
            const from = graph?.pages[(origin?.pageNumber ?? source.pageNumber) - 1]?.rotation;
            const to = graph?.pages[item.pageNumber - 1]?.rotation;
            const offset = (source.data.nativeMarkupPreviewOffset ?? 0) + (origin && from !== undefined && to !== undefined ? (from - to) / 90 : 0);
            if (Number.isInteger(offset)) data.nativeMarkupPreviewOffset = ((offset % 4) + 4) % 4;
          }
          if (!origin) {
            // The source /NM remains the writer/deletion identity even if a
            // stale sidecar renamed the UI ID. Never trust its cached name.
            const sourceName = source.data.nativeOriginalName ?? source.id;
            if (item.id !== source.id || source.data.nativeOriginalName) {
              data.nativeOriginalName = sourceName;
            } else {
              delete data.nativeOriginalName;
            }
            if (source.data.nativeSourceRef) data.nativeSourceRef = source.data.nativeSourceRef;
          }
          if (source.data.nativeAppearanceRef) data.nativeAppearanceRef = source.data.nativeAppearanceRef;
          if (source.data.nativeAppearanceRect) data.nativeAppearanceRect = source.data.nativeAppearanceRect;
          if (source.data.nativeAppearanceBodyRect) data.nativeAppearanceBodyRect = source.data.nativeAppearanceBodyRect;
          if (source.data.nativeAppearanceImported) data.nativeAppearanceImported = true;
          // A legacy sidecar can contain edits but no explicit AP dirty marker.
          // Do not show the stale source artwork over an edited text/shape.
          if (!origin && source.data.nativeAppearanceImported && [
            ...edited,
          ].some((field) => field === 'rect'
            ? JSON.stringify(item.rect) !== JSON.stringify(source.rect)
            : JSON.stringify(item.data[field]) !== JSON.stringify(source.data[field]))) {
            data.nativeAppearanceDirty = true;
          } else if (!origin) {
            delete data.nativeAppearanceDirty;
          }
          if (source.data.nativeAppearanceRotation !== undefined) data.nativeAppearanceRotation = source.data.nativeAppearanceRotation;
          if (source.data.nativeAppearancePageRotation !== undefined) data.nativeAppearancePageRotation = source.data.nativeAppearancePageRotation;
        }
        return { ...item, type: resolvedType, rect: effectiveRect, data };
      });
      // A missing or corrupted cached entry is NOT an explicit deletion.
      // Only source-revision/page-matched deletion commands suppress recovery.
      const missingSource = stored === null ? [] : imported.annotations.filter((item) => {
        const key = nativeSourceKey(item);
        return !matchedSourceKeys.has(key) && !deletedSourceKeys.has(key);
      });
      const model = [...restored, ...missingSource];
      setAnnotations(model);
      const hydrated = useAnnotationStore.getState().annotations;
      const coverage = summarizeNativeAnnotationCoverage(
        imported.sourceRoots ?? [],
        imported.annotations,
        hydrated,
        validTombstones,
      );
      logDebug('annotation', 'Native annotation source → parser → model coverage', {
        documentKey,
        ...coverage,
      });
      if (coverage.missingFromParser.length
        || coverage.missingFromModel.length
        || coverage.duplicateInModel.length) {
        logWarn('annotation', 'Native annotation coverage is incomplete', {
          documentKey,
          missingFromParser: coverage.missingFromParser,
          missingFromModel: coverage.missingFromModel,
          duplicateInModel: coverage.duplicateInModel,
        });
      }
      const incomplete = cacheUnavailable
        || invalidTombstones.length > 0 || unmatchedCachedNative.length > 0
        || unresolvedCachedEdits.length > 0
        || coverage.missingFromParser.length > 0
        || coverage.missingFromModel.length > 0
        || coverage.duplicateInModel.length > 0;
      const nativeIntegrity: NativeIntegrityState = {
        documentKey,
        status: incomplete ? 'INCOMPLETE' : 'COMPLETE',
        cacheState: cacheUnavailable ? 'UNAVAILABLE' : snapshot ? 'VALID' : 'EMPTY',
        ...(incomplete ? { reason: 'Native source/cache identity verification incomplete' } : {}),
      };
      useAnnotationStore.setState({
        hydratedDocumentKey: documentKey,
        nativeIntegrity,
        nativeDeletionTombstones: validTombstones,
      });
      restoredCountCallback.current(hydrated.length);
      if (incomplete) {
        // Do not overwrite a potentially recoverable legacy draft with the
        // source-authoritative display model until the conflict is resolved.
        logWarn('annotation', 'Native Save disabled pending source/cache reconciliation', {
          documentKey, unmatchedCachedNative, unresolvedCachedEdits,
          invalidTombstones: invalidTombstones.length,
        });
        useToastStore.getState().addToast({
          type: 'error',
          title: 'Native annotation recovery incomplete',
          message: 'Editable Save is disabled to protect original PDF annotations. The original PDF remains available to download.',
        });
        return;
      }
      // Persist only a verified source baseline. Missing cache entries never
      // authorize native deletion, and disputed drafts are left untouched.
      void saveAnnotations(documentKey, hydrated, {
        nativeSourceKeys: imported.annotations.map(nativeSourceKey),
        nativeDeletionTombstones: validTombstones,
      }).catch((err) => {
        if (useSessionStore.getState().documentKey === documentKey) {
          useAnnotationStore.setState({
            nativeIntegrity: {
              status: 'INCOMPLETE', documentKey,
              reason: 'Native deletion and edit provenance could not be persisted',
              cacheState: 'UNAVAILABLE',
            },
          });
        }
        logError('annotation', 'Failed to persist native annotation baseline', {
          error: String(err), documentKey,
        });
      });
    };
    void loadStored().catch((err) => {
      if (cancelled) return;
      useAnnotationStore.setState({
        nativeIntegrity: { status: 'FAILED', documentKey, reason: String(err) },
      });
      logError('annotation', 'Failed to hydrate native annotations', {
        error: String(err), documentKey,
      });
    });
    return () => { cancelled = true; };
  }, [documentKey, workingBytes, setAnnotations]);

  React.useEffect(() => {
    if (!documentKey || !pdfDoc || hydratedDocumentKey !== documentKey
      || useAnnotationStore.getState().nativeIntegrity.status !== 'COMPLETE') return;
    let cancelled = false;

    const run = async () => {
      const current = useAnnotationStore.getState().annotations;
      if (current.length === 0) return;
      if (current.every((annotation) => annotation.data.geometryVersion === 2 && annotation.data.normalizedGeometry)) {
        return;
      }

      const pageDims = new Map<number, { width: number; height: number }>();
      for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
        const page = await pdfDoc.getPage(pageNumber);
        pageDims.set(pageNumber, PdfRendererAdapter.getPageDimensions(page));
        page.cleanup();
      }

      const migrated = current.map((annotation) => {
        const dims = pageDims.get(annotation.pageNumber);
        if (!dims) return annotation;
        return ensureAnnotationHasNormalizedGeometry(annotation, dims);
      });

      if (!cancelled && useSessionStore.getState().documentKey === documentKey
        && useAnnotationStore.getState().annotations === current
        && JSON.stringify(migrated) !== JSON.stringify(current)) {
        setAnnotations(migrated);
        void saveAnnotations(documentKey, migrated).catch((err) => {
          logError('annotation', 'Failed to persist normalized geometry migration', {
            documentKey,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [documentKey, pdfDoc, setAnnotations, hydratedDocumentKey]);

  React.useEffect(() => {
    if (!documentKey || hydratedDocumentKey !== documentKey
      || useAnnotationStore.getState().nativeIntegrity.status !== 'COMPLETE') return;

    const timer = window.setTimeout(() => {
      void saveAnnotations(documentKey, annotations, {
        nativeDeletionTombstones,
      }).catch(err => {
        logError('annotation', 'Annotation autosave failed', {
          documentKey,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [annotations, nativeDeletionTombstones, documentKey, hydratedDocumentKey]);

  React.useEffect(() => {
    if (!documentKey || hydratedDocumentKey !== documentKey
      || useAnnotationStore.getState().nativeIntegrity.status !== 'COMPLETE') return;

    const flushNow = () => {
      const state = useAnnotationStore.getState();
      void saveAnnotations(documentKey, state.annotations, {
        nativeDeletionTombstones: state.nativeDeletionTombstones,
      }).catch(err => {
        logError('annotation', 'Annotation pagehide flush failed', {
          documentKey,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    };

    window.addEventListener('pagehide', flushNow);

    return () => {
      window.removeEventListener('pagehide', flushNow);
    };
  }, [documentKey, hydratedDocumentKey]);
}
