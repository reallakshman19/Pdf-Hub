import React from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadAnnotationsOrNull, saveAnnotations } from '@/core/annotations/persistence';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { error as logError } from '@/core/logger/service';
import { ensureAnnotationHasNormalizedGeometry } from '@/core/annotations/normalized';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from '@/core/pdf-annotations/nativeAnnotationReader';

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
  React.useEffect(() => {
    let cancelled = false;
    const loadStored = async () => {
      if (!documentKey || !workingBytes) return;
      setRestoredCount(0);
      const before = useAnnotationStore.getState().annotations;
      const stored = await loadAnnotationsOrNull(documentKey);
      const imported = await readNativePdfAnnotations(workingBytes);
      if (cancelled || useSessionStore.getState().documentKey !== documentKey
        || useSessionStore.getState().workingBytes !== workingBytes) return;
      if (useAnnotationStore.getState().annotations !== before) {
        throw new Error('Annotations changed before the native document finished loading.');
      }
      const sourceByKey = new Map<string, PdfAnnotation>();
      const sourceByText = new Map<string, PdfAnnotation>();
      const sourceByPos = new Map<string, PdfAnnotation>();
      for (const item of imported.annotations) {
        sourceByKey.set(`${item.pageNumber}\u0000${item.id}`, item);
        if (item.data.nativeOriginalName) {
          sourceByKey.set(`${item.pageNumber}\u0000${item.data.nativeOriginalName}`, item);
        }
        const strippedId = item.id.replace(/^pdfhub-native-p\d+:/, '');
        sourceByKey.set(`${item.pageNumber}\u0000${strippedId}`, item);
        if (item.data.text) {
          const normText = item.data.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
          sourceByText.set(`${item.pageNumber}\u0000${normText}`, item);
        }
        sourceByPos.set(`${item.pageNumber}\u0000${Math.round(item.rect.x)}:${Math.round(item.rect.y)}`, item);
      }
      const model = stored === null ? imported.annotations : stored.map((item) => {
        const origin = item.data.nativeCopySource;
        const pageNum = origin?.pageNumber ?? item.pageNumber;
        const rawKey = origin?.nativeName ?? item.data.nativeOriginalName ?? item.id;
        const normItemText = item.data.text
          ? item.data.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
          : '';
        const source = sourceByKey.get(`${pageNum}\u0000${rawKey}`)
          ?? sourceByKey.get(`${pageNum}\u0000${rawKey.replace(/^pdfhub-native-p\d+:/, '')}`)
          ?? sourceByKey.get(`${pageNum}\u0000${item.id}`)
          ?? (normItemText ? sourceByText.get(`${pageNum}\u0000${normItemText}`) : undefined)
          ?? sourceByPos.get(`${pageNum}\u0000${Math.round(item.rect.x)}:${Math.round(item.rect.y)}`);
        const data = { ...item.data };
        delete data.nativeSourceRef;
        delete data.nativeAppearanceRef;
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
        const resolvedType: PdfAnnotation['type'] = (source?.type === 'callout' || item.type === 'callout')
          ? 'callout'
          : (source?.type ?? item.type);
        if (source) {
          // Draft state cannot authorize changes to artwork already in the PDF.
          delete data.nativeMarkupDraft;
          if (resolvedType === 'callout') {
            if (source.data.anchor) data.anchor = source.data.anchor;
            if (source.data.knee) data.knee = source.data.knee;
            if (source.data.leaderStyle) data.leaderStyle = source.data.leaderStyle;
            if (source.data.arrowHead) data.arrowHead = source.data.arrowHead;
            if (source.rect && (!item.data.isUserModified)) {
              effectiveRect = source.rect;
            }
          }
          if (resolvedType === 'callout' || resolvedType === 'textbox') {
            if (source.data.borderColor) data.borderColor = source.data.borderColor;
            if (source.data.backgroundColor) data.backgroundColor = source.data.backgroundColor;
            if (typeof source.data.textColor === 'string') data.textColor = source.data.textColor;
            if (typeof source.data.fontFamily === 'string') data.fontFamily = source.data.fontFamily;
            if (typeof source.data.borderWidth === 'number') data.borderWidth = source.data.borderWidth;
            if (typeof source.data.text === 'string' && !item.data.isUserModified) data.text = source.data.text;
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
          if (!origin && source.data.nativeSourceRef) data.nativeSourceRef = source.data.nativeSourceRef;
          if (source.data.nativeAppearanceRef) data.nativeAppearanceRef = source.data.nativeAppearanceRef;
          if (source.data.nativeAppearanceRotation !== undefined) data.nativeAppearanceRotation = source.data.nativeAppearanceRotation;
          if (source.data.nativeAppearancePageRotation !== undefined) data.nativeAppearancePageRotation = source.data.nativeAppearancePageRotation;
        }
        return { ...item, type: resolvedType, rect: effectiveRect, data };
      });
      setAnnotations(model);
      const hydrated = useAnnotationStore.getState().annotations;
      useAnnotationStore.setState({ hydratedDocumentKey: documentKey });
      setRestoredCount(hydrated.length);
    };
    void loadStored().catch((err) => {
      if (!cancelled) logError('annotation', 'Failed to load native annotations', { error: String(err), documentKey });
    });
    return () => { cancelled = true; };
  }, [documentKey, workingBytes, setAnnotations, setRestoredCount]);

  React.useEffect(() => {
    if (!documentKey || !pdfDoc || hydratedDocumentKey !== documentKey) return;
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
    if (!documentKey || hydratedDocumentKey !== documentKey) return;

    const timer = window.setTimeout(() => {
      void saveAnnotations(documentKey, annotations).catch(err => {
        logError('annotation', 'Annotation autosave failed', {
          documentKey,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [annotations, documentKey, hydratedDocumentKey]);

  React.useEffect(() => {
    if (!documentKey || hydratedDocumentKey !== documentKey) return;

    const flushNow = () => {
      void saveAnnotations(documentKey, useAnnotationStore.getState().annotations).catch(err => {
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
