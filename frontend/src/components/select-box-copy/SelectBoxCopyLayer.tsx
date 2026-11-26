import React from 'react';
import type { WriterPageViewport } from '@/core/writer-v2/types';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { captureDocumentMutationOwner, isDocumentMutationOwnerCurrent, isDocumentSessionOwnerCurrent, type DocumentMutationOwner } from '@/core/session/mutationOwner';
import { captureWriterPersistenceOwner, isWriterPersistenceOwnerCurrent } from '@/core/writer-v2/persistence/writerPersistenceOwner';
import { insertSelectBoxCopyIntoWriter } from '@/core/select-box-copy/insertSelectBoxCopyIntoWriter';
import { getViewportSize } from '@/core/writer-v2/coordinateTransform';
import {
  extractSelectBoxCopyFromDocument,
} from '@/core/select-box-copy/selectBoxCopyEngine';
import {
  renderSelectBoxImageSnapshotFromDocument,
} from '@/core/select-box-copy/imageSnapshot';
import {
  acquireActivePdfDocumentLease,
} from '@/adapters/pdf-renderer/activePdfDocumentLease';
import type {
  PdfDocumentLease,
} from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  isOperationCancelledError,
} from '@/core/cancellation/operationCancellation';
import {
  writeSelectBoxCopyToClipboard,
  type SelectBoxCopyMode,
} from '@/core/select-box-copy/clipboardWriter';
import {
  normalizeViewportRect,
  clipViewportRect,
} from '@/core/select-box-copy/selectionGeometry';
import { resolveRecommendedMode, type SelectBoxInsertMode } from '@/core/select-box-copy/selectBoxCopyMode';
import type {
  SelectBoxCopyResult,
  SelectBoxViewportRect,
} from '@/core/select-box-copy/types';
import { SelectBoxCopyResultPanel } from './SelectBoxCopyResultPanel';

export interface SelectBoxCopyLayerProps {
  pageNumber: number;
  viewport: WriterPageViewport;
}

export const SelectBoxCopyLayer: React.FC<SelectBoxCopyLayerProps> = ({
  pageNumber,
  viewport,
}) => {
  const activeWriterTool = useWriterV2Store((state) => state.activeWriterTool);
  const setActiveWriterTool = useWriterV2Store((state) => state.setActiveWriterTool);
  const workingBytes = useSessionStore((state) => state.workingBytes);
  const documentKey = useSessionStore((state) => state.documentKey);
  const revisionStoreId = useSessionStore(
    (state) => state.revisionStoreId,
  );
  const originalRevisionId = useSessionStore(
    (state) => state.originalRevisionId,
  );
  const activeRevisionId = useSessionStore(
    (state) => state.activeRevisionId,
  );
  const completeSaveOperation = useSessionStore((state) => state.completeSaveOperation);
  const failSaveOperation = useSessionStore((state) => state.failSaveOperation);

  const hasActiveDocument = Boolean(
    workingBytes || activeRevisionId,
  );
  const operationAbortControllerRef =
    React.useRef<AbortController | null>(null);
  const selectionOperationIdRef = React.useRef(0);
  const dragStartRef = React.useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const selectionOwnerRef = React.useRef<DocumentMutationOwner | null>(null);
  const isSelectionCurrent = (id: number, owner: DocumentMutationOwner | null, afterCommit = false) =>
    !!owner && id === selectionOperationIdRef.current
    && useWriterV2Store.getState().activeWriterTool === 'selectBoxCopy'
    && (afterCommit ? isDocumentSessionOwnerCurrent(owner) : isDocumentMutationOwnerCurrent(owner));

  const [draftRect, setDraftRect] = React.useState<SelectBoxViewportRect | null>(null);
  const [result, setResult] = React.useState<SelectBoxCopyResult | null>(null);
  const [busy, setBusy] = React.useState(false);


  const withActiveDocument = async <T,>(
    operation: string,
    work: (
      doc: PdfDocumentLease['doc'],
      signal: AbortSignal,
    ) => Promise<T>,
  ): Promise<T> => {
    operationAbortControllerRef.current?.abort(
      `Superseded Select Box operation: ${operation}`,
    );
    const controller = new AbortController();
    operationAbortControllerRef.current = controller;
    let lease: PdfDocumentLease | null = null;

    try {
      lease = await acquireActivePdfDocumentLease({
        documentKey,
        workingBytes,
        revisionStoreId,
        originalRevisionId,
        activeRevisionId,
      }, controller.signal);

      if (!lease) {
        throw new Error(
          'Open a PDF before using Select Box Copy.',
        );
      }

      return await work(lease.doc, controller.signal);
    } finally {
      await lease?.release();
      if (
        operationAbortControllerRef.current
        === controller
      ) {
        operationAbortControllerRef.current = null;
      }
    }
  };

  const [prevSessionDeps, setPrevSessionDeps] = React.useState({
    activeWriterTool,
    documentKey,
    workingBytes,
    revisionStoreId,
    originalRevisionId,
    activeRevisionId,
    pageNumber,
  });
  if (
    prevSessionDeps.activeWriterTool !== activeWriterTool
    || prevSessionDeps.documentKey !== documentKey
    || prevSessionDeps.workingBytes !== workingBytes
    || prevSessionDeps.revisionStoreId !== revisionStoreId
    || prevSessionDeps.originalRevisionId !== originalRevisionId
    || prevSessionDeps.activeRevisionId !== activeRevisionId
    || prevSessionDeps.pageNumber !== pageNumber
  ) {
    setPrevSessionDeps({
      activeWriterTool,
      documentKey,
      workingBytes,
      revisionStoreId,
      originalRevisionId,
      activeRevisionId,
      pageNumber,
    });
    setDraftRect(null);
    setResult(null);
    setBusy(false);
  }

  React.useEffect(() => {
    return () => {
      selectionOperationIdRef.current += 1;
      selectionOwnerRef.current = null;
      dragStartRef.current = null;
      operationAbortControllerRef.current?.abort('Select Box Copy renderer session changed or layer deactivated');
    };
  }, [
    activeWriterTool,
    documentKey,
    workingBytes,
    revisionStoreId,
    originalRevisionId,
    activeRevisionId,
    pageNumber,
    viewport.pdfWidth,
    viewport.pdfHeight,
    viewport.scale,
    viewport.rotation,
  ]);

  if (activeWriterTool !== 'selectBoxCopy') {
    return null;
  }

  const beginSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!hasActiveDocument) {
      failSaveOperation('Open a PDF before using Select Box Copy.');
      setActiveWriterTool('select');
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    if (event.button !== undefined && event.button !== 0) return;
    operationAbortControllerRef.current?.abort('New Select Box gesture');
    selectionOperationIdRef.current += 1;
    selectionOwnerRef.current = captureDocumentMutationOwner();
    dragStartRef.current = { x, y, pointerId: event.pointerId };
    setBusy(false);
    setResult(null);
    setDraftRect({
      x,
      y,
      width: 0,
      height: 0,
    });

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const updateSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;

    if (!start || start.pointerId !== event.pointerId) return;

    event.stopPropagation();
    event.preventDefault();

    const bounds = event.currentTarget.getBoundingClientRect();

    setDraftRect({
      x: start.x,
      y: start.y,
      width: event.clientX - bounds.left - start.x,
      height: event.clientY - bounds.top - start.y,
    });
  };

  const finishSelection = async (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    const owner = selectionOwnerRef.current;
    const selectionOperationId = selectionOperationIdRef.current;
    if (!hasActiveDocument || !start || start.pointerId !== event.pointerId || !isSelectionCurrent(selectionOperationId, owner)) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragStartRef.current = null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const size = getViewportSize(viewport);
    const normalized = clipViewportRect({ x: start.x, y: start.y,
      width: event.clientX - bounds.left - start.x, height: event.clientY - bounds.top - start.y }, size.width, size.height);
    if (normalized.width < 8 || normalized.height < 8) {
      setDraftRect(null);
      return;
    }
    setBusy(true);

    try {
      const extracted = await withActiveDocument(
        'extract text',
        (doc, signal) =>
          extractSelectBoxCopyFromDocument({
            doc,
            pageNumber,
            viewport,
            viewportRect: normalized,
            signal,
          }),
      );

      if (!isSelectionCurrent(selectionOperationId, owner)) return;
      setResult(extracted);
      setDraftRect(normalized);
      completeSaveOperation(
        extracted.partialTextItems ? 'Selection cuts native text runs. Expand it or use image mode.' : extracted.items.length === 0
          ? 'Select Box Copy found no text. Copy Image or Insert as Image is available.'
          : extracted.table
            ? `Select Box Copy captured ${extracted.items.length} text items; table confidence ${Math.round(extracted.table.confidence * 100)}%.`
            : `Select Box Copy captured ${extracted.items.length} text items.`,
      );
    } catch (error) {
      if (isOperationCancelledError(error) || !isSelectionCurrent(selectionOperationId, owner)) return;
      failSaveOperation(error instanceof Error ? error.message : String(error));
      setResult(null);
    } finally {
      if (
        isSelectionCurrent(selectionOperationId, owner)
      ) {
        setBusy(false);
      }
    }
  };

  // Each rendered result is bound to the gesture that produced it. A late
  // callback from a prior panel may not acquire authority from the new panel.
  const resultOwner = selectionOwnerRef.current;
  const resultId = selectionOperationIdRef.current;
  const resultCurrent = (afterCommit = false) => isSelectionCurrent(resultId, resultOwner, afterCommit);
  const copySelection = async (mode: SelectBoxCopyMode, effectiveResult: SelectBoxCopyResult) => {
    if (!resultCurrent()) return;
    try {
      await writeSelectBoxCopyToClipboard(effectiveResult, mode);
      if (resultCurrent()) completeSaveOperation('Copied selected PDF content.');
    } catch (error) {
      if (!isOperationCancelledError(error) && resultCurrent()) failSaveOperation(error instanceof Error ? error.message : String(error));
    }
  };
  const captureImage = () => withActiveDocument('capture image', (doc, signal) =>
    renderSelectBoxImageSnapshotFromDocument({ doc, pageNumber, viewport, viewportRect: draftRect!, signal }));
  const copyImage = async (effectiveResult: SelectBoxCopyResult) => {
    if (!draftRect || !resultCurrent()) return;
    try {
      const imageDataUrl = await captureImage();
      if (!resultCurrent()) return;
      await writeSelectBoxCopyToClipboard({ ...effectiveResult, imageDataUrl }, 'image');
      if (resultCurrent()) completeSaveOperation('Selected PDF area copied as image.');
    } catch (error) {
      if (!isOperationCancelledError(error) && resultCurrent()) failSaveOperation(error instanceof Error ? error.message : String(error));
    }
  };
  const insertIntoWriter = async (mode: SelectBoxInsertMode, effectiveResult: SelectBoxCopyResult) => {
    if (!draftRect || !resultCurrent()) return;
    const owner = captureWriterPersistenceOwner();
    const actualMode = mode === 'auto' ? resolveRecommendedMode(effectiveResult) : mode;
    try {
      const imageDataUrl = actualMode === 'image' ? await captureImage() : undefined;
      if (!resultCurrent() || !isWriterPersistenceOwnerCurrent(owner)) return;
      const insertResult = await insertSelectBoxCopyIntoWriter({ owner, result: effectiveResult, mode: actualMode, imageDataUrl, isSelectionCurrent: resultCurrent });
      if (!resultCurrent(true)) return;
      if (!insertResult.changed) throw new Error(insertResult.reason || 'Writer insertion made no change.');
      completeSaveOperation('Select Box Copy inserted into Writer V2.');
      setActiveWriterTool('select');
      setDraftRect(null);
      setResult(null);
    } catch (error) {
      if (!isOperationCancelledError(error) && resultCurrent()) failSaveOperation(error instanceof Error ? error.message : String(error));
    }
  };
  const cancelSelection = () => {
    selectionOperationIdRef.current += 1;
    selectionOwnerRef.current = null;
    dragStartRef.current = null;
    operationAbortControllerRef.current?.abort('Select Box Copy cancelled');
    setDraftRect(null);
    setResult(null);
    setBusy(false);
  };
  const closePanel = () => {
    cancelSelection();
    setActiveWriterTool('select');
  };

  const normalizedDraftRect = draftRect ? normalizeViewportRect(draftRect) : null;

  return (
    <div
      data-select-box-copy-layer="true"
      aria-label={`Select Box Copy layer page ${pageNumber}`}
      onPointerDown={beginSelection}
      onPointerMove={updateSelection}
      onPointerUp={(event) => {
        void finishSelection(event);
      }}
      onPointerCancel={(event) => {
        if (dragStartRef.current?.pointerId === event.pointerId) {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          cancelSelection();
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: 'crosshair',
        pointerEvents: 'auto',
        zIndex: 30,
      }}
    >
      {normalizedDraftRect ? (
        <div
          data-select-box-copy-rect="true"
          style={{
            position: 'absolute',
            left: normalizedDraftRect.x,
            top: normalizedDraftRect.y,
            width: normalizedDraftRect.width,
            height: normalizedDraftRect.height,
            border: '1px solid #0f766e',
            background: 'rgba(20, 184, 166, 0.12)',
          }}
        />
      ) : null}

      {result && normalizedDraftRect ? (
        <div
          style={{
            position: 'absolute',
            left: normalizedDraftRect.x,
            top: Math.max(0, normalizedDraftRect.y - 46),
            pointerEvents: 'auto',
          }}
        >
          <SelectBoxCopyResultPanel
            result={result}
            onCopy={(mode, effectiveResult) => {
              void copySelection(mode, effectiveResult);
            }}
            onCopyImage={(effectiveResult) => {
              void copyImage(effectiveResult);
            }}
            onInsertWriter={(mode, effectiveResult) => {
              void insertIntoWriter(mode, effectiveResult);
            }}
            onClose={closePanel}
          />
        </div>
      ) : null}

      {busy ? (
        <div
          style={{
            position: 'absolute',
            right: 12,
            top: 12,
            padding: '4px 8px',
            background: '#0f172a',
            color: '#ffffff',
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          Extracting…
        </div>
      ) : null}
    </div>
  );
};