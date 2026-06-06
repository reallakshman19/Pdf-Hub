import React from 'react';
import {
  Crop,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { PdfRect } from '@/core/writer-v2/types';
import type { OcrRegion, OcrRegionMode } from '@/core/ocr/ocrRegionModel';
import {
  createOcrRegion,
  validateOcrRegion,
} from '@/core/ocr/ocrRegionModel';

export interface OcrRegionToolProps {
  documentFingerprint: string;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  onCreateRegion: (region: OcrRegion) => void;
}

export interface OcrRegionDraft {
  mode: OcrRegionMode;
  bbox: PdfRect;
}

export const OCR_REGION_MODES: Array<{
  value: OcrRegionMode;
  label: string;
}> = [
  {
    value: 'text',
    label: 'Text',
  },
  {
    value: 'table',
    label: 'Table',
  },
  {
    value: 'note',
    label: 'Note',
  },
  {
    value: 'review',
    label: 'Review',
  },
  {
    value: 'metadata',
    label: 'Metadata',
  },
];

export const OcrRegionTool: React.FC<OcrRegionToolProps> = ({
  documentFingerprint,
  pageIndex,
  pageWidth,
  pageHeight,
  viewportWidth,
  viewportHeight,
  onCreateRegion,
}) => {
  const [draft, setDraft] = React.useState<OcrRegionDraft>(() => ({
    mode: 'text',
    bbox: {
      x: 72,
      y: Math.max(0, pageHeight - 180),
      width: 220,
      height: 80,
    },
  }));

  const [dragStart, setDragStart] = React.useState<{
    x: number;
    y: number;
  } | null>(null);

  const [error, setError] = React.useState<string | null>(null);

  const updateBbox = (patch: Partial<PdfRect>) => {
    setDraft((current) => ({
      ...current,
      bbox: {
        ...current.bbox,
        ...patch,
      },
    }));
  };

  const resetDraft = () => {
    setDraft({
      mode: 'text',
      bbox: {
        x: 72,
        y: Math.max(0, pageHeight - 180),
        width: 220,
        height: 80,
      },
    });
    setError(null);
  };

  const addRegion = () => {
    const region = createOcrRegion({
      id: `ocr-region-${Date.now()}`,
      documentFingerprint,
      pageIndex,
      mode: draft.mode,
      bbox: draft.bbox,
    });

    const validation = validateOcrRegion(region, {
      pageIndex,
      width: pageWidth,
      height: pageHeight,
    });

    if (!validation.valid) {
      setError(validation.diagnostics[0]?.message ?? 'Invalid OCR region.');
      return;
    }

    setError(null);
    onCreateRegion(region);
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const point = eventToViewportPoint(event);
    setDragStart(point);

    const pdfPoint = viewportPointToPdfPoint({
      point,
      pageWidth,
      pageHeight,
      viewportWidth,
      viewportHeight,
    });

    setDraft((current) => ({
      ...current,
      bbox: {
        x: pdfPoint.x,
        y: pdfPoint.y,
        width: 0,
        height: 0,
      },
    }));
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!dragStart) return;

    const current = eventToViewportPoint(event);

    const startPdf = viewportPointToPdfPoint({
      point: dragStart,
      pageWidth,
      pageHeight,
      viewportWidth,
      viewportHeight,
    });

    const currentPdf = viewportPointToPdfPoint({
      point: current,
      pageWidth,
      pageHeight,
      viewportWidth,
      viewportHeight,
    });

    setDraft((existing) => ({
      ...existing,
      bbox: normalizePdfRectFromPoints(startPdf, currentPdf),
    }));
  };

  const handlePointerUp = () => {
    setDragStart(null);
  };

  const draftViewportRect = pdfRectToViewportRect({
    rect: draft.bbox,
    pageWidth,
    pageHeight,
    viewportWidth,
    viewportHeight,
  });

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-region-tool"
    >
      <div className="mb-2 flex items-center gap-2">
        <Crop className="h-4 w-4 text-blue-600" />
        <div>
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            OCR Region Tool
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Draw or enter a region to OCR later.
          </p>
        </div>
      </div>

      <div
        className="relative mb-3 overflow-hidden rounded border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
        style={{
          width: viewportWidth,
          height: viewportHeight,
          maxWidth: '100%',
        }}
        data-testid="ocr-region-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">
          Page {pageIndex + 1} region preview
        </div>

        <div
          className="absolute rounded border-2 border-blue-500 bg-blue-500/15"
          data-testid="ocr-region-draft-box"
          style={{
            left: draftViewportRect.left,
            top: draftViewportRect.top,
            width: Math.max(0, draftViewportRect.width),
            height: Math.max(0, draftViewportRect.height),
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-600 dark:text-slate-300">
          Mode
          <select
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={draft.mode}
            data-testid="ocr-region-mode"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                mode: event.currentTarget.value as OcrRegionMode,
              }))
            }
          >
            {OCR_REGION_MODES.map((mode) => (
              <option
                key={mode.value}
                value={mode.value}
              >
                {mode.label}
              </option>
            ))}
          </select>
        </label>

        <NumberInput
          label="X"
          value={draft.bbox.x}
          testId="ocr-region-x"
          onChange={(value) => updateBbox({ x: value })}
        />

        <NumberInput
          label="Y"
          value={draft.bbox.y}
          testId="ocr-region-y"
          onChange={(value) => updateBbox({ y: value })}
        />

        <NumberInput
          label="Width"
          value={draft.bbox.width}
          testId="ocr-region-width"
          onChange={(value) => updateBbox({ width: value })}
        />

        <NumberInput
          label="Height"
          value={draft.bbox.height}
          testId="ocr-region-height"
          onChange={(value) => updateBbox({ height: value })}
        />
      </div>

      {error ? (
        <p
          className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
          data-testid="ocr-region-error"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={addRegion}
          data-testid="ocr-region-add"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add region
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={resetDraft}
          data-testid="ocr-region-reset"
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Reset
        </Button>
      </div>
    </div>
  );
};

function NumberInput({
  label,
  value,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  testId: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-xs text-slate-600 dark:text-slate-300">
      {label}
      <input
        className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
        type="number"
        value={Number.isFinite(value) ? Math.round(value) : 0}
        data-testid={testId}
        onChange={(event) =>
          onChange(Number(event.currentTarget.value))
        }
      />
    </label>
  );
}

function eventToViewportPoint(
  event: React.PointerEvent<HTMLDivElement>,
): {
  x: number;
  y: number;
} {
  const rect = event.currentTarget.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function viewportPointToPdfPoint(input: {
  point: {
    x: number;
    y: number;
  };
  pageWidth: number;
  pageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): {
  x: number;
  y: number;
} {
  const scaleX = input.pageWidth / Math.max(1, input.viewportWidth);
  const scaleY = input.pageHeight / Math.max(1, input.viewportHeight);

  return {
    x: clamp(input.point.x * scaleX, 0, input.pageWidth),
    y: clamp(input.pageHeight - input.point.y * scaleY, 0, input.pageHeight),
  };
}

export function pdfRectToViewportRect(input: {
  rect: PdfRect;
  pageWidth: number;
  pageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const scaleX = input.viewportWidth / Math.max(1, input.pageWidth);
  const scaleY = input.viewportHeight / Math.max(1, input.pageHeight);

  return {
    left: input.rect.x * scaleX,
    top: (input.pageHeight - input.rect.y - input.rect.height) * scaleY,
    width: input.rect.width * scaleX,
    height: input.rect.height * scaleY,
  };
}

export function normalizePdfRectFromPoints(
  a: {
    x: number;
    y: number;
  },
  b: {
    x: number;
    y: number;
  },
): PdfRect {
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);

  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(value, max));
}
