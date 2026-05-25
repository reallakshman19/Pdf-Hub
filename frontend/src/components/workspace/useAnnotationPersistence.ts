import React from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadAnnotations, saveAnnotations } from '@/core/annotations/persistence';
import { useAnnotationStore } from '@/core/annotations/store';
import { error as logError } from '@/core/logger/service';
import { ensureAnnotationHasNormalizedGeometry } from '@/core/annotations/normalized';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { PdfAnnotation } from '@/core/annotations/types';

interface UseAnnotationPersistenceArgs {
  documentKey: string | null;
  pdfDoc: PDFDocumentProxy | null;
  annotations: PdfAnnotation[];
  setAnnotations: (annotations: PdfAnnotation[]) => void;
  setRestoredCount: (count: number) => void;
}

export function useAnnotationPersistence({
  documentKey,
  pdfDoc,
  annotations,
  setAnnotations,
  setRestoredCount,
}: UseAnnotationPersistenceArgs): void {
  React.useEffect(() => {
    const loadStored = async () => {
      if (!documentKey) return;
      setRestoredCount(0);
      const stored = await loadAnnotations(documentKey);
      setAnnotations(stored);
      if (stored.length > 0) setRestoredCount(stored.length);
    };
    void loadStored();
  }, [documentKey, setAnnotations, setRestoredCount]);

  React.useEffect(() => {
    if (!documentKey || !pdfDoc) return;

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

      if (JSON.stringify(migrated) !== JSON.stringify(current)) {
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
  }, [documentKey, pdfDoc, setAnnotations]);

  React.useEffect(() => {
    if (!documentKey) return;

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
  }, [annotations, documentKey]);

  React.useEffect(() => {
    if (!documentKey) return;

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
  }, [documentKey]);
}
