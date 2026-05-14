import React from 'react';
import type { WriterPageViewport } from '@/core/writer-v2/types';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  extractSelectBoxCopyFromPdf,
} from '@/core/select-box-copy/selectBoxCopyEngine';
import { renderSelectBoxImageSnapshot } from '@/core/select-box-copy/imageSnapshot';
import { writeSelectBoxCopyToClipboard } from '@/core/select-box-copy/clipboardWriter';
import { createWriterElementFromSelectBoxCopy } from '@/core/select-box-copy/insertIntoWriterV2';
import {
  normalizeViewportRect,
} from '@/core/select-box-copy/selectionGeometry';
import type {
  SelectBoxCopyResult,
  SelectBoxViewportRect,
} from '@/core/select-box-copy/types';

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
        extracted.table
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

  const copyImage = async () => {
    if (!sourceBytes || !draftRect || !result) return;

    try {
      const imageDataUrl = await renderSelectBoxImageSnapshot({
        pdfBytes: sourceBytes,
        pageNumber,
        viewport,
        viewportRect: draftRect,
      });

      await writeSelectBoxCopyToClipboard({
        ...result,
        imageDataUrl,
      }, 'image');

      completeSaveOperation('Selected PDF area copied as image.');
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
    }
  };

  const insertIntoWriter = () => {
    if (!result) return;

    const documentFingerprint =
      currentDocumentFingerprint ??
      documentKey ??
      fileName ??
      'select-box-copy-document';

    const maxZIndex = allElements.reduce(
      (max, element) => Math.max(max, element.style.zIndex),
      0,
    );

    const element = createWriterElementFromSelectBoxCopy({
      result,
      documentFingerprint,
      zIndex: maxZIndex + 1,
    });

    dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element,
    });

    setActiveWriterTool('select');
    setDraftRect(null);
    setResult(null);
    completeSaveOperation('Select Box Copy inserted into Writer V2.');
  };

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
      {draftRect ? (
        <div
          data-select-box-copy-rect="true"
          style={{
            position: 'absolute',
            left: normalizeViewportRect(draftRect).x,
            top: normalizeViewportRect(draftRect).y,
            width: normalizeViewportRect(draftRect).width,
            height: normalizeViewportRect(draftRect).height,
            border: '1px solid #0f766e',
            background: 'rgba(20, 184, 166, 0.12)',
          }}
        />
      ) : null}

      {result && draftRect ? (
        <div
          data-select-box-copy-panel="true"
          style={{
            position: 'absolute',
            left: normalizeViewportRect(draftRect).x,
            top: Math.max(0, normalizeViewportRect(draftRect).y - 38),
            display: 'flex',
            gap: 4,
            padding: 4,
            borderRadius: 6,
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
            pointerEvents: 'auto',
          }}
        >
          <PanelButton
            label="Copy Text"
            onClick={() => {
              void writeSelectBoxCopyToClipboard(result, 'plain')
                .then(() => completeSaveOperation('Copied selected text.'))
                .catch((error) => failSaveOperation(String(error)));
            }}
          />
          <PanelButton
            label="Copy Formatted"
            onClick={() => {
              void writeSelectBoxCopyToClipboard(result, 'formatted')
                .then(() => completeSaveOperation('Copied formatted selection.'))
                .catch((error) => failSaveOperation(String(error)));
            }}
          />
          <PanelButton
            label={result.table ? `Copy Table ${Math.round(result.table.confidence * 100)}%` : 'Copy Table'}
            disabled={!result.table}
            onClick={() => {
              void writeSelectBoxCopyToClipboard(result, 'table')
                .then(() => completeSaveOperation('Copied selected table.'))
                .catch((error) => failSaveOperation(String(error)));
            }}
          />
          <PanelButton
            label="Copy Image"
            onClick={() => {
              void copyImage();
            }}
          />
          <PanelButton
            label="Insert Writer"
            onClick={insertIntoWriter}
          />
          <PanelButton
            label="Close"
            onClick={() => {
              setDraftRect(null);
              setResult(null);
              setActiveWriterTool('select');
            }}
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

function PanelButton({
  label,
  disabled = false,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        height: 28,
        padding: '0 8px',
        fontSize: 12,
        borderRadius: 5,
        border: '1px solid #cbd5e1',
        background: disabled ? '#f1f5f9' : '#ffffff',
        color: disabled ? '#94a3b8' : '#0f172a',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}