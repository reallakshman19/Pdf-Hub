import React from 'react';
import type { WriterPageViewport } from '@/core/writer-v2/types';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  extractSelectBoxCopyFromPdf,
} from '@/core/select-box-copy/selectBoxCopyEngine';
import { renderSelectBoxImageSnapshot } from '@/core/select-box-copy/imageSnapshot';
import {
  writeSelectBoxCopyToClipboard,
  type SelectBoxCopyMode,
} from '@/core/select-box-copy/clipboardWriter';
import { createWriterElementFromSelectBoxCopy } from '@/core/select-box-copy/insertIntoWriterV2';
import {
  normalizeViewportRect,
} from '@/core/select-box-copy/selectionGeometry';
import { createSelectBoxImageAssetFromDataUrl } from '@/core/select-box-copy/selectBoxImageAsset';
import type { SelectBoxInsertMode } from '@/core/select-box-copy/selectBoxCopyMode';
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
  const currentDocumentFingerprint = useWriterV2Store((state) => state.currentDocumentFingerprint);
  const allElements = useWriterV2Store((state) => state.elements);
  const dispatchWriterCommand = useWriterV2Store((state) => state.dispatchWriterCommand);
  const addWriterAssets = useWriterV2Store((state) => state.addWriterAssets);

  const workingBytes = useSessionStore((state) => state.workingBytes);
  const originalBytes = useSessionStore((state) => state.originalBytes);
  const documentKey = useSessionStore((state) => state.documentKey);
  const fileName = useSessionStore((state) => state.fileName);
  const completeSaveOperation = useSessionStore((state) => state.completeSaveOperation);
  const failSaveOperation = useSessionStore((state) => state.failSaveOperation);

  const sourceBytes = workingBytes ?? originalBytes;
  const dragStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const [draftRect, setDraftRect] = React.useState<SelectBoxViewportRect | null>(null);
  const [result, setResult] = React.useState<SelectBoxCopyResult | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (activeWriterTool !== 'selectBoxCopy') {
    return null;
  }

  const beginSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!sourceBytes) {
      failSaveOperation('Open a PDF before using Select Box Copy.');
      setActiveWriterTool('select');
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    dragStartRef.current = { x, y };
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

    if (!start) return;

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
    const rect = draftRect;

    if (!sourceBytes || !rect) return;

    event.stopPropagation();
    event.preventDefault();

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragStartRef.current = null;

    const normalized = normalizeViewportRect(rect);

    if (normalized.width < 8 || normalized.height < 8) {
      setDraftRect(null);
      return;
    }

    setBusy(true);

    try {
      const extracted = await extractSelectBoxCopyFromPdf({
        pdfBytes: sourceBytes,
        pageNumber,
        viewport,
        viewportRect: normalized,
      });

      setResult(extracted);
      setDraftRect(normalized);
      completeSaveOperation(
        extracted.items.length === 0
          ? 'Select Box Copy found no text. Copy Image or Insert as Image is available.'
          : extracted.table
            ? `Select Box Copy captured ${extracted.items.length} text items; table confidence ${Math.round(extracted.table.confidence * 100)}%.`
            : `Select Box Copy captured ${extracted.items.length} text items.`,
      );
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const copySelection = async (
    mode: SelectBoxCopyMode,
    effectiveResult: SelectBoxCopyResult,
  ) => {
    try {
      await writeSelectBoxCopyToClipboard(effectiveResult, mode);

      completeSaveOperation(
        mode === 'table'
          ? 'Copied selected table.'
          : mode === 'formatted'
            ? 'Copied formatted selection.'
            : 'Copied selected text.',
      );
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
    }
  };

  const copyImage = async (effectiveResult: SelectBoxCopyResult) => {
    if (!sourceBytes || !draftRect) return;

    try {
      const imageDataUrl = await renderSelectBoxImageSnapshot({
        pdfBytes: sourceBytes,
        pageNumber,
        viewport,
        viewportRect: draftRect,
      });

      await writeSelectBoxCopyToClipboard({
        ...effectiveResult,
        imageDataUrl,
      }, 'image');

      completeSaveOperation('Selected PDF area copied as image.');
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
    }
  };

  const insertIntoWriter = async (
    mode: SelectBoxInsertMode,
    effectiveResult: SelectBoxCopyResult,
  ) => {
    if (!sourceBytes || !draftRect) return;

    try {
      const documentFingerprint =
        currentDocumentFingerprint ??
        documentKey ??
        fileName ??
        'select-box-copy-document';

      const maxZIndex = allElements.reduce(
        (max, element) => Math.max(max, element.style.zIndex),
        0,
      );

      let imageAssetId: string | undefined;

      if (mode === 'image') {
        const imageDataUrl = await renderSelectBoxImageSnapshot({
          pdfBytes: sourceBytes,
          pageNumber,
          viewport,
          viewportRect: draftRect,
        });

        const asset = createSelectBoxImageAssetFromDataUrl({
          dataUrl: imageDataUrl,
          documentFingerprint,
        });

        addWriterAssets([asset]);
        imageAssetId = asset.id;
      }

      const element = createWriterElementFromSelectBoxCopy({
        result: effectiveResult,
        documentFingerprint,
        zIndex: maxZIndex + 1,
        mode,
        imageAssetId,
      });

      dispatchWriterCommand({
        type: 'ADD_WRITER_ELEMENT',
        element,
      });

      setActiveWriterTool('select');
      setDraftRect(null);
      setResult(null);
      completeSaveOperation('Select Box Copy inserted into Writer V2.');
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
    }
  };

  const closePanel = () => {
    setDraftRect(null);
    setResult(null);
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
        void finishSelection(event);
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